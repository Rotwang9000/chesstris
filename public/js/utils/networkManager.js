/**
 * Network Manager
 * Handles all network communication in the game.
 */
import io from '/node_modules/socket.io-client/dist/socket.io.esm.min.js';

// Configuration Constants
const CONNECTION_TIMEOUT_MS = 10000; // 10 seconds
const JOIN_GAME_TIMEOUT_MS = 5000;   // 5 seconds
const LEAVE_GAME_TIMEOUT_MS = 3000;  // 3 seconds
const MAX_RECONNECT_INTERVAL_MS = 30000; // 30 seconds

/**
 * Module exports
 */
const exports = {};

// Initialize the global NetworkManager immediately
if (typeof window !== 'undefined') {
	// Create the NetworkManager global if it doesn't exist
	window.NetworkManager = window.NetworkManager || {};
	
	// Define a single shared state object
	window.NetworkManager.state = window.NetworkManager.state || {
		socket: null,
		gameId: null,
		playerId: null,
		playerName: null,
		connectionStatus: 'disconnected',
		messageHandlers: {},
		reconnectAttempts: 0,
		maxReconnectAttempts: Infinity,
		isInitializing: false,
		hasJoinedGame: false,
		lastConnectionAttempt: 0,
		connectionThrottleMs: 2000,
		gameState: null,
		hasAutoInitialized: false,
		gameStatePollingEnabled: false,
		gameStatePollingInterval: null,
		lastUpdateTimestamp: 0,
		eventListeners: {
			connect: [],
			disconnect: [],
			error: [],
			message: {}
		}
	};
}

// Configuration
const API_BASE_URL = '/api'; // Default to same-origin API
const SOCKET_URL = ''; // Empty string means connect to the same server
const POLL_INTERVAL = 5000; // Reduced from 2000ms to 5000ms (5 seconds)

// Access shared state throughout the module
const getState = () => {
	// Initialize the global NetworkManager state if it doesn't exist
	if (typeof window !== 'undefined') {
		if (!window.NetworkManager) {
			window.NetworkManager = {};
		}
		
		if (!window.NetworkManager.state) {
			window.NetworkManager.state = {
				socket: null,
				gameId: null,
				playerId: null,
				playerName: null,
				connectionStatus: 'disconnected',
				messageHandlers: {},
				reconnectAttempts: 0,
				maxReconnectAttempts: Infinity,
				isInitializing: false,
				hasJoinedGame: false,
				lastConnectionAttempt: 0,
				connectionThrottleMs: 2000,
				gameState: null,
				hasAutoInitialized: false,
				gameStatePollingEnabled: false,
				gameStatePollingInterval: null,
				lastUpdateTimestamp: 0,
				eventListeners: {
					connect: [],
					disconnect: [],
					error: [],
					message: {}
				}
			};
		}
		
		return window.NetworkManager.state;
	}
	
	// Fallback for non-browser environments
	return {
		socket: null,
		gameId: null,
		playerId: null,
		connectionStatus: 'disconnected',
		hasAutoInitialized: false
	};
};

// Initialize as soon as this module loads to make sure it's ready
// This self-initializing behavior helps ensure the network is available
if (typeof window !== 'undefined' && typeof io !== 'undefined') {
	// Use setTimeout to ensure window.NetworkManager is fully initialized
	setTimeout(() => {
		const state = getState();
		
		// Check if we've already auto-initialized or if there's an existing NetworkManager instance
		if (state.hasAutoInitialized || (window.NetworkManager && window.NetworkManager.isConnected && typeof window.NetworkManager.isConnected === 'function' && window.NetworkManager.isConnected())) {
			console.log('NetworkManager: Skipping auto-initialization as already initialized');
			return;
		}
		
		// Store current state in window.NetworkManager for global access
		// Ensure we're always using our exports object
		window.NetworkManager = Object.assign(window.NetworkManager || {}, exports);
		
		// Mark as auto-initialized
		state.hasAutoInitialized = true;
		
		// If we're in dev mode, auto-connect
		const isDevMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
		if (isDevMode) {
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
		}
	}, 1000);
}

/**
 * Initialize the network connection
 * @param {string} playerName - Player name
 * @returns {Promise<boolean>} - Promise that resolves to true if successful
 */
export function initialize(playerName = 'Guest') {
	const state = getState();
	
	// Check if already initializing to prevent multiple simultaneous initializations
	if (state.isInitializing) {
		console.log('NetworkManager: Already initializing, returning existing promise');
		return new Promise((resolve) => {
			// Check status every 100ms until initialization completes
			const checkInterval = setInterval(() => {
				const currentState = getState();
				if (!currentState.isInitializing) {
					clearInterval(checkInterval);
					resolve(currentState.socket && currentState.socket.connected);
				}
			}, 100);
		});
	}
	
	// Check if already connected
	if (state.socket && state.socket.connected) {
		console.log('NetworkManager: Already connected');
		
		// Update player name if different
		if (state.playerName !== playerName) {
			state.playerName = playerName;
			console.log(`NetworkManager: Updated player name to ${playerName}`);
		}
		
		// Ensure connection status is correctly set
		state.connectionStatus = 'connected';
		emitEvent('connect', { connected: true, playerName: state.playerName, playerId: state.playerId });
		
		return Promise.resolve(true);
	}
	
	// Throttle reconnection attempts to prevent overloading the server
	const now = Date.now();
	if (state.reconnectAttempts > 0) {
		const timeSinceLastReconnect = now - state.lastReconnectTime;
		const minReconnectInterval = Math.min(1000 * Math.pow(2, state.reconnectAttempts - 1), MAX_RECONNECT_INTERVAL_MS);
		
		if (timeSinceLastReconnect < minReconnectInterval) {
			const waitTime = minReconnectInterval - timeSinceLastReconnect;
			console.log(`NetworkManager: Throttling reconnection attempt. Waiting ${waitTime}ms`);
			
			return new Promise(resolve => {
				setTimeout(() => {
					resolve(initialize(playerName));
				}, waitTime);
			});
		}
	}
	
	// Update reconnection tracking
	state.reconnectAttempts++;
	state.lastReconnectTime = now;
	state.isInitializing = true; // Mark as initializing
	
	// Set connection status
	state.connectionStatus = 'connecting';
	emitEvent('connecting', { connecting: true, playerName: playerName });
	
	return new Promise((resolve, reject) => {
		try {
			// Clean up existing socket if present
			if (state.socket) {
				console.log('NetworkManager: Cleaning up existing socket');
				state.socket.off();
				state.socket.disconnect();
				state.socket = null;
			}
			
			// Determine server URL based on environment
			const socketUrl = determineServerUrl();
			console.log(`NetworkManager: Connecting to server at ${socketUrl}`);
			
			// Create new socket connection
			const socket = io(socketUrl, {
				reconnection: false, // We'll handle reconnection manually
				timeout: CONNECTION_TIMEOUT_MS,
				query: {
					playerName: playerName
				}
			});
			
			// Set up initial event handlers
			socket.on('connect', () => {
				console.log('NetworkManager: Connected to server');
				state.socket = socket;
				state.playerName = playerName;
				state.isInitializing = false;
				state.reconnectAttempts = 0; // Reset counter on successful connection
				state.connectionStatus = 'connected';
				
				// Update global reference for compatibility
				window.NetworkManager.socket = socket;
				
				// Emit connect event to listeners
				emitEvent('connect', { connected: true, playerName: state.playerName, playerId: state.playerId || socket.id });
				
				resolve(true);
			});
			
			socket.on('connect_error', (error) => {
				console.error('NetworkManager: Connection error:', error);
				state.isInitializing = false;
				state.connectionStatus = 'error';
				
				// Emit error event to listeners
				emitEvent('error', { error: error.message || 'Connection error' });
				
				reject(new Error(`Connection error: ${error.message || 'Unknown error'}`));
			});
			
			socket.on('connect_timeout', () => {
				console.error('NetworkManager: Connection timeout');
				state.isInitializing = false;
				state.connectionStatus = 'error';
				
				// Emit error event to listeners
				emitEvent('error', { error: 'Connection timeout' });
				
				reject(new Error('Connection timeout'));
			});
			
			socket.on('disconnect', (reason) => {
				console.warn(`NetworkManager: Disconnected: ${reason}`);
				state.connectionStatus = 'disconnected';
				
				// Emit disconnect event to listeners
				emitEvent('disconnect', { reason: reason });
				
				// Show a toast message if available
				if (typeof window !== 'undefined' && typeof window.showToastMessage === 'function') {
					window.showToastMessage(`Disconnected from server: ${reason}. Attempting to reconnect...`);
				}
				
				// Attempt to reconnect if appropriate
				if (reason !== 'io client disconnect') {
					// Wait briefly before attempting to reconnect
					setTimeout(() => {
						console.log('NetworkManager: Attempting to reconnect after disconnect');
						ensureConnected(state.playerName);
					}, 1000);
				}
			});
			
			socket.on('player:registered', (data) => {
				console.log('NetworkManager: Player registered:', data);
				state.playerId = data.playerId;
				
				// Emit player registered event
				emitEvent('player_registered', data);
			});
			
			// Set timeout for connection
			setTimeout(() => {
				if (state.isInitializing) {
					console.error('NetworkManager: Connection attempt timed out');
					state.isInitializing = false;
					state.connectionStatus = 'error';
					
					// Emit error event
					emitEvent('error', { error: 'Connection attempt timed out' });
					
					reject(new Error('Connection attempt timed out'));
					
					// Clean up socket to prevent memory leaks
					if (socket) {
						socket.off();
						socket.disconnect();
					}
				}
			}, CONNECTION_TIMEOUT_MS);
			
		} catch (error) {
			console.error('NetworkManager: Error initializing:', error);
			state.isInitializing = false;
			state.connectionStatus = 'error';
			
			// Emit error event
			emitEvent('error', { error: error.message || 'Error initializing connection' });
			
			reject(error);
		}
	});
}

/**
 * Determine the server URL based on the environment
 * @returns {string} Server URL
 */
function determineServerUrl() {
	if (typeof window === 'undefined') {
		// Node.js environment
		return 'http://localhost:3000';
	}
	
	// Browser environment
	const location = window.location;
	let protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
	
	// Special handling for certain URLs
	if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
		// Local development - use the current host
		return `${location.protocol}//${location.host}`;
	} else if (location.hostname.includes('ngrok.io') || location.hostname.includes('vercel.app')) {
		// ngrok or vercel deployments
		return `${location.protocol}//${location.host}`;
	}
	
	// Default: use the current host
	return `${location.protocol}//${location.host}`;
}

/**
 * Reconnect if disconnected and join game if needed
 * @param {string} playerNameArg - Optional player name to use 
 * @param {number} maxAttempts - Maximum number of reconnection attempts
 * @returns {Promise<boolean>} - Promise that resolves to true if connected
 */
export function ensureConnected(playerNameArg = null, maxAttempts = 3) {
	const state = getState();
	
	// If we're already initializing, wait for that to complete
	if (state.isInitializing) {
		console.log('NetworkManager: Already initializing, waiting for completion');
		return new Promise((resolve) => {
			// Check status every 100ms until initialization completes
			const checkInterval = setInterval(() => {
				const currentState = getState();
				if (!currentState.isInitializing) {
					clearInterval(checkInterval);
					// Now check if we're connected
					if (currentState.socket && currentState.socket.connected) {
						console.log('NetworkManager: Connection established during wait');
						resolve(true);
					} else {
						// If still not connected after initialization completed, try again
						console.log('NetworkManager: Not connected after initialization, retrying');
						resolve(ensureConnected(playerNameArg, maxAttempts));
					}
				}
			}, 100);
		});
	}

	const playerNameToUse = playerNameArg || state.playerName || 'Guest';
	
	// Check connection and initialize if needed
	if (!state.socket || !state.socket.connected) {
		console.log(`NetworkManager: Not connected, attempting to connect with backoff strategy`);
		
		// Track this initialization attempt
		state.hasAutoInitialized = true;
		
		// Create a function for reconnection attempts with proper backoff strategy
		const attemptReconnectWithBackoff = (attempt = 1) => {
			if (attempt > maxAttempts) {
				console.error(`NetworkManager: Failed to connect after ${maxAttempts} attempts`);
				return Promise.resolve(false);
			}
			
			// Calculate exponential backoff delay with jitter
			// First attempt: 1-2 seconds, second: 2-4 seconds, third: 4-8 seconds, etc.
			const baseDelay = Math.pow(2, attempt - 1) * 1000;
			const jitter = Math.random() * 0.5 * baseDelay; // Add up to 50% random jitter
			const delay = baseDelay + jitter;
			
			console.log(`NetworkManager: Connection attempt ${attempt}/${maxAttempts} with ${delay.toFixed(0)}ms delay`);
			
			// First attempt should be immediate
			if (attempt === 1) {
				return initialize(playerNameToUse)
					.then(() => {
						console.log('NetworkManager: Successfully connected on first attempt');
						
						// If we have a game ID, rejoin it
						if (state.gameId) {
							console.log(`NetworkManager: Rejoining existing game: ${state.gameId}`);
							return joinGame(state.gameId)
								.then(() => {
									console.log('NetworkManager: Successfully rejoined game');
									return true;
								})
								.catch(error => {
									console.warn('NetworkManager: Error rejoining game:', error);
									// Still return true since we're connected
									return true;
								});
						}
						return true;
					})
					.catch(error => {
						console.error(`NetworkManager: First connection attempt failed:`, error);
						
						// Show a toast message if available
						if (typeof window !== 'undefined' && typeof window.showToastMessage === 'function') {
							window.showToastMessage(`Connection failed (attempt ${attempt}/${maxAttempts}). Retrying in ${Math.round(delay/1000)}s...`);
						}
						
						// Wait with backoff before attempting next try
						return new Promise(resolve => {
							setTimeout(() => {
								resolve(attemptReconnectWithBackoff(attempt + 1));
							}, delay);
						});
					});
			} else {
				// For subsequent attempts, always delay first, then try
				return new Promise(resolve => {
					// Show a countdown toast if available
					if (typeof window !== 'undefined' && typeof window.showToastMessage === 'function') {
						window.showToastMessage(`Retrying connection in ${Math.round(delay/1000)}s... (attempt ${attempt}/${maxAttempts})`);
					}
					
					setTimeout(() => {
						console.log(`NetworkManager: Executing reconnection attempt ${attempt}/${maxAttempts}`);
						
						initialize(playerNameToUse)
							.then(() => {
								console.log(`NetworkManager: Successfully connected on attempt ${attempt}`);
								
								// If we have a game ID, rejoin it
								if (state.gameId) {
									console.log(`NetworkManager: Rejoining existing game: ${state.gameId}`);
									return joinGame(state.gameId)
										.then(() => {
											console.log('NetworkManager: Successfully rejoined game');
											resolve(true);
										})
										.catch(error => {
											console.warn('NetworkManager: Error rejoining game:', error);
											// Still resolve true since we're connected
											resolve(true);
										});
								} else {
									resolve(true);
								}
							})
							.catch(error => {
								console.error(`NetworkManager: Connection attempt ${attempt} failed:`, error);
								
								// Try again with next backoff if not at maximum attempts
								if (attempt < maxAttempts) {
									resolve(attemptReconnectWithBackoff(attempt + 1));
								} else {
									console.error(`NetworkManager: Failed to connect after ${maxAttempts} attempts`);
									resolve(false);
								}
							});
					}, delay);
				});
			}
		};
		
		// Start the reconnection process
		return attemptReconnectWithBackoff();
	}
	
	// Already connected
	console.log('NetworkManager: Already connected, no reconnection needed');
	return Promise.resolve(true);
}
// Add to exports
exports.ensureConnected = ensureConnected;

/**
 * Connect to Socket.IO server
 * @returns {Promise} - Resolves when connected
 */
function connectSocketIO() {
	// If already connected, return immediately
	if (getState().socket && getState().socket.connected) {
		console.log('NetworkManager: Already connected to Socket.IO');
		getState().connectionStatus = 'connected';
		return Promise.resolve();
	}
	
	// Create socket connection if needed
	if (!getState().socket) {
		console.log('NetworkManager: Creating new socket.io connection');
		getState().socket = io(SOCKET_URL, { 
			reconnection: true, 
			reconnectionDelay: 1000,
			reconnectionDelayMax: 30000, // Increased from 5000 to 30000
			reconnectionAttempts: Infinity, // Changed from 10 to Infinity for unlimited attempts
			timeout: 20000, // Add longer timeout
			// Use exponential backoff for reconnection
			randomizationFactor: 0.5,
			reconnect: true // Enable automatic reconnection
		});
		
		// Set up connection events
		getState().socket.on('connect', () => {
			console.log('NetworkManager: Socket connected');
			getState().connectionStatus = 'connected';
			getState().reconnectAttempts = 0;
			
			// Emit event to listeners
			emitEvent('connect', { connected: true });
		});
		
		getState().socket.on('disconnect', () => {
			console.log('NetworkManager: Socket disconnected');
			getState().connectionStatus = 'disconnected';
			
			// Emit event to listeners
			emitEvent('disconnect', { connected: false });
		});
		
		getState().socket.on('connect_error', (error) => {
			console.error('NetworkManager: Socket connection error:', error);
			getState().connectionStatus = 'error';
			getState().reconnectAttempts++;
			
			// Emit event to listeners
			emitEvent('error', { error });
			
			// Log the reconnect attempt
			console.log(`NetworkManager: Reconnect attempt ${getState().reconnectAttempts}, will retry automatically`);
		});
		
		// Set up message handler for all server messages
		getState().socket.on('message', (data) => {
			console.log('NetworkManager: Received message:', data);
			
			// Emit message to registered handlers
			if (data && data.type) {
				emitMessage(data.type, data.payload || {});
			}
		});

		// Add direct listener for game_state events (these might not come through the message event)
		getState().socket.on('game_state', (data) => {
			console.log('NetworkManager: Received direct game_state event:', data);
			
			try {
				// Process the game state data
				// The structure may be different based on the server response
				let payload;
				
				if (data && typeof data === 'object') {
					// Extract the game state based on the structure
					if (data.state) {
						// Format: {gameId: 'x', state: {...}, players: [...]}
						payload = {
							...data.state,
							players: data.players || [],
							gameId: data.gameId
						};
					} else {
						// Assume the data itself is the payload
						payload = data;
					}
					
					// Store the game state locally for future reference
					getState().gameState = payload;
					
					// Emit message using common event system - both methods for compatibility
					emitEvent('message', { type: 'game_state', payload });
					emitMessage('game_state', payload);
					
					console.log('NetworkManager: Game state processed successfully');
				} else {
					console.warn('NetworkManager: Received invalid game state format:', data);
				}
			} catch (error) {
				console.error('NetworkManager: Error processing game state:', error);
			}
		});
	}
	
	return new Promise((resolve, reject) => {
		if (getState().socket.connected) {
			console.log('NetworkManager: Already connected, resolving immediately');
			getState().connectionStatus = 'connected';
			resolve();
		} else {
			console.log('NetworkManager: Waiting for connection...');
			
			// Set up one-time handler for successful connection
			const connectHandler = () => {
				console.log('NetworkManager: Connection established');
				getState().connectionStatus = 'connected';
				getState().socket.off('connect', connectHandler);
				getState().socket.off('connect_error', errorHandler);
				resolve();
			};
			
			// Set up one-time handler for connection error
			const errorHandler = (error) => {
				console.error('NetworkManager: Connection failed:', error);
				getState().connectionStatus = 'error';
				getState().socket.off('connect', connectHandler);
				getState().socket.off('connect_error', errorHandler);
				reject(new Error('Failed to connect to server'));
			};
			
			// Register handlers
			getState().socket.once('connect', connectHandler);
			getState().socket.once('connect_error', errorHandler);
			
			// If already connecting, just wait for the events
			if (getState().socket.connecting) {
				console.log('NetworkManager: Socket is already connecting, waiting...');
				return;
			}
			
			// Otherwise, connect explicitly
			getState().socket.connect();
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
		if (!getState().socket) {
			// Initialize Socket.IO first
			connectSocketIO();
			
			// Wait a bit for the connection to establish
			await new Promise(resolve => setTimeout(resolve, 500));
		}
		
		// Check if socket is now available and connected
		if (!getState().socket) {
			throw new Error("Failed to initialize Socket.IO connection");
		}
		
		// Since we don't have a dedicated registration endpoint, we'll use the socket ID
		// as the player ID and handle registration during the join_game event
		console.log('NetworkManager: Using socket ID as player ID:', getState().socket.id);
		const mockPlayerId = getState().socket.id || 'player_' + Math.floor(Math.random() * 10000);
		
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
	getState().connectionStatus = 'connected';
	getState().reconnectAttempts = 0;
	
	// Notify NetworkStatusManager if available
	if (window.NetworkStatusManager) {
		window.NetworkStatusManager.setStatus(window.NetworkStatusManager.NetworkStatus.CONNECTED);
	}
	
	// Trigger connect event
	triggerEvent('connect', { playerId: getState().playerId });
}

/**
 * Handle Socket.IO disconnect event
 * @param {string} reason - Disconnect reason
 */
function handleSocketDisconnect(reason) {
	console.log(`NetworkManager: Socket.IO disconnected: ${reason}`);
	getState().connectionStatus = 'disconnected';
	
	// Notify NetworkStatusManager if available
	if (window.NetworkStatusManager) {
		window.NetworkStatusManager.setStatus(window.NetworkStatusManager.NetworkStatus.DISCONNECTED);
	}
	
	// Socket.IO handles reconnection automatically
	
	triggerEvent('disconnect', { reason });
}

/**
 * Handle Socket.IO error
 * @param {Error} error - Error object
 */
function handleSocketError(error) {
	console.error('NetworkManager: Socket.IO error:', error);
	
	// Notify NetworkStatusManager if available
	if (window.NetworkStatusManager) {
		window.NetworkStatusManager.setStatus(window.NetworkStatusManager.NetworkStatus.ERROR);
	}
	
	// Trigger error event
	triggerEvent('error', { error });
}

/**
 * Handle Socket.IO messages
 * @param {Object} message - Message object
 */
function handleSocketMessage(message) {
	try {
		console.log('NetworkManager: Received message:', message);
		
		// Handle message based on type
		if (message.type && getState().messageHandlers[message.type]) {
			getState().messageHandlers[message.type](message);
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
	if (!getState().eventListeners.message[messageType]) {
		getState().eventListeners.message[messageType] = [];
	}
	getState().eventListeners.message[messageType].push(handler);
	
	// Also register with Socket.IO for this specific event
	if (getState().socket) {
		getState().socket.on(messageType, (data) => {
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
	// Initialize the event type array if it doesn't exist
	if (!getState().eventListeners[eventType]) {
		getState().eventListeners[eventType] = [];
		console.log(`NetworkManager: Created new event listener category: ${eventType}`);
	}
	
	if (Array.isArray(getState().eventListeners[eventType])) {
		getState().eventListeners[eventType].push(callback);
	} else {
		console.warn(`NetworkManager: Event listener array for ${eventType} is not properly initialized`);
		getState().eventListeners[eventType] = [callback]; // Reset and initialize properly
	}
	
	// Register direct socket event listener for standard events
	if (getState().socket && ['connect', 'disconnect', 'error'].includes(eventType)) {
		console.log(`NetworkManager: Adding direct socket listener for: ${eventType}`);
		getState().socket.on(eventType, (data) => {
			callback(data || {});
		});
	}
}

/**
 * Remove event listener
 * @param {string} eventType - Event type
 * @param {Function} callback - Callback function
 */
export function removeEventListener(eventType, callback) {
	if (getState().eventListeners[eventType]) {
		getState().eventListeners[eventType] = getState().eventListeners[eventType].filter(c => c !== callback);
	}
}

/**
 * Alias for addEventListener to provide socket.io-like interface 
 * @param {string} eventType - Event type
 * @param {Function} callback - Callback function
 */
export function on(eventType, callback) {
	return addEventListener(eventType, callback);
}

/**
 * Trigger an event manually to registered listeners
 * @param {string} eventType - Event type
 * @param {any} data - Event data
 */
export function triggerEvent(eventType, data) {
	console.log(`NetworkManager: Manually triggering event: ${eventType}`, data);
	
	// Use the emitMessage function for message events
	emitMessage(eventType, data);
	
	// Also raise a DOM event
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
	if (!getState().socket || !getState().socket.connected) {
		console.error('NetworkManager: Cannot send message, socket not connected');
		return false;
	}
	
	try {
		getState().socket.emit(eventType, data);
		return true;
	} catch (error) {
		console.error('NetworkManager: Error sending message:', error);
		return false;
	}
}

/**
 * Join a game
 * @param {string} gameIdArg - Game ID to join
 * @returns {Promise<Object>} - Promise that resolves to game joining result
 */
export function joinGame(gameIdArg) {
	const state = getState();
	
	// Log the join attempt
	console.log(`NetworkManager: Attempting to join game: ${gameIdArg || 'new game'}`);
	
	return ensureConnected().then(isConnected => {
		if (!isConnected) {
			console.error('NetworkManager: Cannot join game - not connected to server');
			return Promise.reject(new Error('Cannot join game - not connected to server'));
		}
		
		// Update the player ID from socket if we don't have one yet
		if (!state.playerId && state.socket && state.socket.id) {
			state.playerId = state.socket.id;
			console.log(`NetworkManager: Updated playerId to socket id: ${state.playerId}`);
		}
		
		// If we're already in a game, leave it first
		if (state.gameId && state.gameId !== gameIdArg) {
			console.log(`NetworkManager: Leaving current game ${state.gameId} to join ${gameIdArg || 'new game'}`);
			return leaveGame().then(() => {
				// Continue with joining new game
				return _joinGameInner(gameIdArg);
			});
		} else if (state.gameId === gameIdArg && gameIdArg) {
			console.log(`NetworkManager: Already in requested game ${gameIdArg}`);
			return Promise.resolve({ success: true, gameId: gameIdArg });
		} else {
			// Not in any game, join directly
			return _joinGameInner(gameIdArg);
		}
	});
}

/**
 * Internal function to join a game
 * @param {string} gameIdArg - Game ID to join
 * @returns {Promise<Object>} - Promise that resolves to game joining result
 */
function _joinGameInner(gameIdArg) {
	const state = getState();
	
	return new Promise((resolve, reject) => {
		if (!state.socket || !state.socket.connected) {
			console.error('NetworkManager: Cannot join game - socket not connected');
			reject(new Error('Cannot join game - socket not connected'));
			return;
		}
		
		// Generate a unique game ID if none provided
		const gameIdToUse = gameIdArg || Math.random().toString(36).substring(2, 9);
		console.log(`NetworkManager: Using game ID: ${gameIdToUse}`);
		
		// Prepare join request data
		const joinData = {
			gameId: gameIdToUse,
			playerName: state.playerName || 'Guest',
			playerId: state.playerId
		};
		
		// Set a timeout for the operation
		const timeoutId = setTimeout(() => {
			// Remove listeners to avoid memory leaks
			state.socket.off('game:joined');
			state.socket.off('game:error');
			state.socket.off('join_game');
			state.socket.off('player_joined');
			
			console.error(`NetworkManager: Join game timeout after ${JOIN_GAME_TIMEOUT_MS}ms`);
			reject(new Error(`Join game timeout after ${JOIN_GAME_TIMEOUT_MS}ms`));
		}, JOIN_GAME_TIMEOUT_MS);
		
		console.log(`NetworkManager: Sending join request:`, joinData);
		
		// Set up response handlers
		const onJoinSuccess = (data) => {
			clearTimeout(timeoutId);
			
			// Remove all listeners
			state.socket.off('game:joined');
			state.socket.off('game:error');
			state.socket.off('join_game');
			state.socket.off('player_joined');
			
			console.log('NetworkManager: Successfully joined game:', data);
			
			// Update state
			state.gameId = data.gameId || gameIdToUse;
			if (data.playerId) {
				state.playerId = data.playerId;
			}
			
			// Notify listeners if available
			if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
				window.dispatchEvent(new CustomEvent('game:joined', { detail: data }));
			}
			
			resolve({ success: true, gameId: state.gameId, playerId: state.playerId });
		};
		
		const onJoinError = (error) => {
			clearTimeout(timeoutId);
			
			// Remove all listeners
			state.socket.off('game:joined');
			state.socket.off('game:error');
			state.socket.off('join_game');
			state.socket.off('player_joined');
			
			console.error('NetworkManager: Error joining game:', error);
			reject(new Error(`Error joining game: ${error ? (error.message || 'Unknown error') : 'Unknown error'}`));
		};
		
		// Multiple event names for robustness - server implementations vary
		state.socket.once('game:joined', onJoinSuccess);
		state.socket.once('join_game', onJoinSuccess);
		state.socket.once('player_joined', onJoinSuccess);
		state.socket.once('game:error', onJoinError);
		
		// Request to join the game - try both event formats for compatibility
		state.socket.emit('game:join', joinData);
		state.socket.emit('join_game', gameIdToUse, state.playerName, (response) => {
			if (response && response.success) {
				onJoinSuccess(response);
			} else if (response && !response.success) {
				onJoinError(response.error || 'Join game failed');
			}
		});
	});
}

/**
 * Leave the current game
 * @returns {Promise<boolean>} - Promise that resolves to true if successful
 */
export function leaveGame() {
	const state = getState();
	
	return new Promise((resolve, reject) => {
		if (!state.socket || !state.socket.connected) {
			// Not connected, so technically we've left the game
			state.gameId = null;
			resolve(true);
			return;
		}
		
		if (!state.gameId) {
			// Not in a game, nothing to do
			resolve(true);
			return;
		}
		
		// Set a timeout for the operation
		const timeoutId = setTimeout(() => {
			// Remove listeners to avoid memory leaks
			state.socket.off('game:left');
			state.socket.off('game:error');
			
			// Consider it successful even on timeout since we're leaving
			state.gameId = null;
			resolve(true);
		}, LEAVE_GAME_TIMEOUT_MS);
		
		// Set up response handlers
		state.socket.once('game:left', () => {
			clearTimeout(timeoutId);
			console.log('NetworkManager: Successfully left game');
			
			// Update state
			state.gameId = null;
			
			resolve(true);
		});
		
		state.socket.once('game:error', error => {
			clearTimeout(timeoutId);
			console.error('NetworkManager: Error leaving game:', error);
			
			// Still consider it successful since we're leaving
			state.gameId = null;
			resolve(true);
		});
		
		// Request to leave the game
		console.log(`NetworkManager: Requesting to leave game: ${state.gameId}`);
		state.socket.emit('game:leave', { gameId: state.gameId, playerId: state.playerId });
	});
}
// Add to exports
exports.joinGame = joinGame;
exports.leaveGame = leaveGame;

/**
 * Set the game ID directly (internal use)
 * @param {string} id - The game ID to set
 */
function setGameId(id) {
	if (!id) {
		console.warn('NetworkManager: Attempted to set empty gameId, defaulting to global_game');
		getState().gameId = 'global_game';
		return;
	}
	
	console.log(`NetworkManager: Setting gameId to ${id}`);
	getState().gameId = id;
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
	if (!getState().gameId || !getState().playerId) {
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
			let responseReceived = false;
			
			// Send via Socket.IO
			getState().socket.emit('tetromino_placed', {
				gameId: getState().gameId,
				playerId: getState().playerId,
				tetromino: tetrominoData
			}, (response) => {
				responseReceived = true;
				// This callback will be called when the server responds
				if (response && response.success) {
					console.log('NetworkManager: Tetromino placement successful', response);
					resolve(response);
				} else {
					console.error('NetworkManager: Tetromino placement failed', response);
					reject(new Error(response?.error || 'Failed to place tetromino'));
				}
			});
			
			// If socket.io doesn't respond within 5 seconds, reject
			setTimeout(() => {
				if (!responseReceived) {
					console.warn('NetworkManager: Socket.IO response timeout - considering it a failure');
					reject(new Error('Server timeout - tetromino placement failed'));
				}
			}, 5000);
		});
	} catch (error) {
		console.error('NetworkManager: Failed to submit tetromino placement:', error);
		return Promise.reject(error);
	}
}

/**
 * Submit a chess move
 * @param {Object} move - Chess move data
 * @returns {Promise} - Resolves with move result
 */
export async function submitChessMove(move) {
	if (!getState().gameId || !getState().playerId) {
		console.error('NetworkManager: Cannot submit chess move, not in a game');
		return false;
	}
	
	try {
		// First try to send via Socket.IO for real-time sync
		sendMessage('chess_move', {
			gameId: getState().gameId,
			playerId: getState().playerId,
			move
		});
		
		// Then send via API for persistence
		const response = await fetch(`${API_BASE_URL}/games/${getState().gameId}/chess`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Player-ID': getState().playerId
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
	return getState().connectionStatus;
}

/**
 * Check if socket is connected
 * @returns {boolean} - Whether socket is connected
 */
export function isConnected() {
	// Check if socket exists and is connected
	const state = getState();
	if (!state || !state.socket) {
		// Don't try to initialize here - just report we're not connected
		// This prevents unnecessary connection attempts when just checking status
		return false;
	}

	// Check if the socket object has the connected property and it's true
	return state.socket && state.socket.connected === true;
}

/**
 * Get current player ID
 * @returns {string} - Player ID
 */
export function getPlayerId() {
	return getState().playerId;
}

/**
 * Get current game ID
 * @returns {string} - Game ID
 */
export function getGameId() {
	return getState().gameId;
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
	const state = getState();
	if (!state.socket || !state.socket.connected) {
		console.error('NetworkManager: Cannot get game state - not connected to server');
		return Promise.reject(new Error('Not connected to server'));
	}
	
	// Use current gameId if not specified
	const requestGameId = options.gameId || state.gameId;
	
	// Always ensure gameId is a string
	const serializedGameId = typeof requestGameId === 'object' ? 
		JSON.stringify(requestGameId) : String(requestGameId || 'global_game');
	
	// Log the exact format being sent
	console.log(`NetworkManager: Requesting game state for game ID: ${serializedGameId} (type: ${typeof serializedGameId})`);
	
	// Send message to server and wrap in a Promise with timeout
	return new Promise((resolve, reject) => {
		// Set a timeout to avoid hanging indefinitely
		const timeoutId = setTimeout(() => {
			console.error('NetworkManager: Game state request timed out after 10 seconds');
			reject(new Error('Game state request timed out'));
		}, 10000);
		
		// Define callback function for when we receive a response
		const handleResponse = (response) => {
			clearTimeout(timeoutId);
			
			// Log response details
			console.log(`NetworkManager: Received game state response for ${serializedGameId}:`, 
				response ? 'Success' : 'Empty response');
			
			if (response) {
				// Store response in our state
				state.gameState = response;
				
				// Ensure this is a proper game state object
				if (response.state || response.board || response.chessPieces) {
					resolve(response);
				} else {
					console.warn('NetworkManager: Invalid game state format received:', response);
					reject(new Error('Invalid game state format received'));
				}
			} else {
				console.warn('NetworkManager: Empty game state response');
				reject(new Error('Empty game state response'));
			}
		};
		
		// Using the socket's emit with callback function
		state.socket.emit('get_game_state', { gameId: serializedGameId }, handleResponse);
		
		// Also register a one-time listener for 'game_state' event as fallback
		state.socket.once('game_state', (data) => {
			// Only process if we haven't already resolved/rejected
			if (timeoutId) {
				clearTimeout(timeoutId);
				console.log('NetworkManager: Received game state via event instead of callback');
				
				if (data) {
					// Store response in our state
					state.gameState = data;
					resolve(data);
				} else {
					reject(new Error('Empty game state event received'));
				}
			}
		});
	});
}

/**
 * Get current game state (if available)
 * @returns {Object|null} - Current game state or null if not available
 */
export function getCurrentGameState() {
	return getState().gameState;
}

/**
 * Emit an event to registered listeners
 * @param {string} eventType - Event type
 * @param {any} data - Event data
 */
function emitEvent(eventType, data) {
	const state = getState();
	
	// Create the event type array if it doesn't exist
	if (!state.eventListeners[eventType]) {
		state.eventListeners[eventType] = [];
	}
	
	// Verify event listeners array is properly initialized
	if (Array.isArray(state.eventListeners[eventType])) {
		// Call all event listeners for this type
		for (const callback of state.eventListeners[eventType]) {
			try {
				callback(data);
			} catch (error) {
				console.error(`NetworkManager: Error in ${eventType} event listener:`, error);
			}
		}
	} else {
		console.warn(`NetworkManager: eventListeners["${eventType}"] is not an array, initializing it`);
		state.eventListeners[eventType] = [];
	}
	
	// Also raise a DOM event for components not directly using the NetworkManager
	if (typeof document !== 'undefined' && document.dispatchEvent) {
		try {
			const event = new CustomEvent(`network:${eventType}`, { 
				detail: data,
				bubbles: true, 
				cancelable: true 
			});
			document.dispatchEvent(event);
			console.log(`NetworkManager: DOM Event dispatched: network:${eventType}`);
		} catch (error) {
			console.error(`NetworkManager: Error dispatching DOM event network:${eventType}:`, error);
		}
	}
	
	// For debug purposes
	console.log(`NetworkManager: Event emitted: ${eventType}`, data);
}

/**
 * Emit a message event to registered listeners
 * @param {string} messageType - Message type
 * @param {any} data - Message data
 */
function emitMessage(messageType, data) {
	// Make sure eventListeners.message exists
	if (!getState().eventListeners.message) {
		getState().eventListeners.message = {};
	}
	
	// Check if the message type has valid handlers
	if (!getState().eventListeners.message[messageType]) {
		// Initialize properly if it doesn't exist
		getState().eventListeners.message[messageType] = [];
		console.log(`NetworkManager: Initialized event listeners for message type: ${messageType}`);
	}
	
	// Ensure it's an array before proceeding
	if (!Array.isArray(getState().eventListeners.message[messageType])) {
		console.warn(`NetworkManager: eventListeners.message["${messageType}"] is not an array, reinitializing it`);
		getState().eventListeners.message[messageType] = [];
	}
	
	// Call all message handlers for this type
	if (getState().eventListeners.message[messageType].length > 0) {
		// Log only if we have listeners
		console.log(`NetworkManager: Emitting message: ${messageType} to ${getState().eventListeners.message[messageType].length} listeners`);
		
		for (const callback of getState().eventListeners.message[messageType]) {
			try {
				callback(data);
			} catch (error) {
				console.error(`NetworkManager: Error in ${messageType} message listener:`, error);
			}
		}
	} else {
		console.log(`NetworkManager: Message emitted: ${messageType} (no listeners registered)`);
	}
	
	// Also emit as a standard message event with type information
	emitEvent('message', { type: messageType, payload: data });
}

/**
 * Attempt to reconnect to the server with progressive backoff
 * @param {number} maxAttempts - Maximum number of reconnection attempts
 * @returns {Promise} - Resolves when reconnected
 */
export function reconnect(maxAttempts = 5) {
	console.log('NetworkManager: Attempting to reconnect with backoff strategy...');
	
	// If already initializing, wait for that to complete
	if (getState().isInitializing) {
		console.log('NetworkManager: Already initializing, waiting for initialization to complete');
		return new Promise((resolve, reject) => {
			const checkInterval = setInterval(() => {
				if (!getState().isInitializing) {
					clearInterval(checkInterval);
					// Check if we're connected after initialization
					if (getState().socket && getState().socket.connected) {
						console.log('NetworkManager: Initialization completed successfully');
						resolve({ playerId: getState().playerId, status: 'connected' });
					} else {
						// If still not connected, try reconnection again
						reconnect(maxAttempts).then(resolve).catch(reject);
					}
				}
			}, 100);
		});
	}
	
	// If we're still connected, no need to reconnect
	if (getState().socket && getState().socket.connected) {
		console.log('NetworkManager: Socket already connected, no need to reconnect');
		
		// Notify NetworkStatusManager if available
		if (window.NetworkStatusManager) {
			window.NetworkStatusManager.setStatus(window.NetworkStatusManager.NetworkStatus.CONNECTED);
		}
		
		return Promise.resolve({ playerId: getState().playerId, status: 'connected' });
	}
	
	// Close existing socket if it exists
	if (getState().socket) {
		getState().socket.close();
		getState().socket = null;
	}
	
	// Reset connection status
	getState().connectionStatus = 'disconnected';
	
	// Use progressive backoff for reconnection attempts using the same strategy as ensureConnected
	const attemptReconnectWithBackoff = (attempt = 1) => {
		if (attempt > maxAttempts) {
			console.error(`NetworkManager: Failed to reconnect after ${maxAttempts} attempts`);
			return Promise.reject(new Error(`Failed to reconnect after ${maxAttempts} attempts`));
		}
		
		// Calculate exponential backoff delay with jitter
		const baseDelay = Math.pow(2, attempt - 1) * 1000;
		const jitter = Math.random() * 0.5 * baseDelay; // Add up to 50% random jitter
		const delay = baseDelay + jitter;
		
		console.log(`NetworkManager: Reconnection attempt ${attempt}/${maxAttempts} with ${delay.toFixed(0)}ms delay`);
		
		// Notify NetworkStatusManager if available
		if (window.NetworkStatusManager) {
			window.NetworkStatusManager.setStatus(window.NetworkStatusManager.NetworkStatus.CONNECTING);
		}
		
		// First attempt is immediate
		if (attempt === 1) {
			// Mark as auto-initialized to prevent duplicate attempts
			getState().hasAutoInitialized = true;
			
			return initialize(getState().playerName)
				.then(result => {
					console.log('NetworkManager: Reconnection successful on first attempt');
					
					// If we were in a game before, attempt to rejoin
					if (getState().gameId) {
						console.log(`NetworkManager: Attempting to rejoin game ${getState().gameId}`);
						return joinGame(getState().gameId, getState().playerName)
							.then(() => {
								console.log('NetworkManager: Successfully rejoined game');
								return { playerId: getState().playerId, status: 'connected', gameId: getState().gameId };
							})
							.catch(error => {
								console.warn('NetworkManager: Error rejoining game:', error);
								// Still return success for connection
								return { playerId: getState().playerId, status: 'connected' };
							});
					}
					
					return result;
				})
				.catch(error => {
					console.error(`NetworkManager: First reconnection attempt failed:`, error);
					
					// Show a toast message if available
					if (typeof window !== 'undefined' && typeof window.showToastMessage === 'function') {
						window.showToastMessage(`Reconnection failed. Retrying in ${Math.round(delay/1000)}s... (attempt ${attempt}/${maxAttempts})`);
					}
					
					// Wait with exponential backoff
					return new Promise((resolve, reject) => {
						setTimeout(() => {
							attemptReconnectWithBackoff(attempt + 1)
								.then(resolve)
								.catch(reject);
						}, delay);
					});
				});
		} else {
			// For subsequent attempts, always wait first, then try
			return new Promise((resolve, reject) => {
				// Show a countdown toast if available
				if (typeof window !== 'undefined' && typeof window.showToastMessage === 'function') {
					window.showToastMessage(`Retrying connection in ${Math.round(delay/1000)}s... (attempt ${attempt}/${maxAttempts})`);
				}
				
				setTimeout(() => {
					console.log(`NetworkManager: Executing reconnection attempt ${attempt}/${maxAttempts}`);
					
					// Try to initialize a new connection
					initialize(getState().playerName)
						.then(result => {
							console.log(`NetworkManager: Reconnection successful on attempt ${attempt}`);
							
							// If we were in a game before, attempt to rejoin
							if (getState().gameId) {
								console.log(`NetworkManager: Attempting to rejoin game ${getState().gameId}`);
								return joinGame(getState().gameId, getState().playerName)
									.then(() => {
										console.log('NetworkManager: Successfully rejoined game');
										resolve({ playerId: getState().playerId, status: 'connected', gameId: getState().gameId });
									})
									.catch(error => {
										console.warn('NetworkManager: Error rejoining game:', error);
										// Still return success for connection
										resolve({ playerId: getState().playerId, status: 'connected' });
									});
							}
							
							resolve(result);
						})
						.catch(error => {
							console.error(`NetworkManager: Reconnection attempt ${attempt} failed:`, error);
							
							// If we've reached max attempts, reject
							if (attempt >= maxAttempts) {
								reject(new Error(`Failed to reconnect after ${attempt} attempts`));
							} else {
								// Try again with next backoff step
								attemptReconnectWithBackoff(attempt + 1)
									.then(resolve)
									.catch(reject);
							}
						});
				}, delay);
			});
		}
	};
	
	// Start the reconnection process
	return attemptReconnectWithBackoff();
}

/**
 * Get direct access to the socket (emergency use only)
 * @returns {Object} Socket.io socket
 */
export function getSocket() {
	return getState().socket;
}

/**
 * Start polling for game state updates
 * @private
 */
function _startGameStatePolling() {
	// Clean up any existing polling
	_stopGameStatePolling();
	
	// Only start if we have a game ID
	if (!getState().gameId) {
		console.warn('NetworkManager: Cannot start polling without a game ID');
		return;
	}
	
	console.log(`NetworkManager: Starting game state polling every ${POLL_INTERVAL}ms`);
	
	// Flag that polling is enabled
	getState().gameStatePollingEnabled = true;
	
	// Request initial game state immediately
	requestInitialGameState();
	
	// Set up periodic polling
	getState().gameStatePollingInterval = setInterval(() => {
		if (getState().gameStatePollingEnabled) {
			// After initial state, only request updates
			requestGameUpdates();
		}
	}, POLL_INTERVAL);
	
	// Also explicitly listen for game_state events from the server
	if (getState().socket) {
		getState().socket.on('game_state', handleGameStateEvent);
		getState().socket.on('game_update', handleGameUpdateEvent);
	}
}

/**
 * Export startGameStatePolling for external use
 */
export function startGameStatePolling() {
	return _startGameStatePolling();
}

/**
 * Stop polling for game state updates
 * @private
 */
function _stopGameStatePolling() {
	getState().gameStatePollingEnabled = false;
	
	if (getState().gameStatePollingInterval) {
		clearInterval(getState().gameStatePollingInterval);
		getState().gameStatePollingInterval = null;
	}
	
	// Remove event listeners
	if (getState().socket) {
		getState().socket.off('game_state', handleGameStateEvent);
		getState().socket.off('game_update', handleGameUpdateEvent);
	}
}

/**
 * Export stopGameStatePolling for external use
 */
export function stopGameStatePolling() {
	return _stopGameStatePolling();
}

/**
 * Request initial full game state from server
 */
function requestInitialGameState() {
	if (!getState().gameId || !getState().socket || !getState().socket.connected) {
		return;
	}
	
	// Request full game state via socket
	getState().socket.emit('get_game_state', { gameId: getState().gameId }, (response) => {
		if (response) {
			handleGameStateEvent(response);
			
			// Store timestamp for future delta updates
			getState().lastUpdateTimestamp = Date.now();
		}
	});
}

/**
 * Request only updates since last state
 */
function requestGameUpdates() {
	if (!getState().gameId || !getState().socket || !getState().socket.connected) {
		return;
	}
	
	// Only request updates since last update
	getState().socket.emit('get_game_updates', { 
		gameId: getState().gameId,
		since: getState().lastUpdateTimestamp 
	}, (response) => {
		if (response) {
			handleGameUpdateEvent(response);
			
			// Update timestamp
			getState().lastUpdateTimestamp = Date.now();
		}
	});
}

/**
 * Handle game state event from server
 */
function handleGameStateEvent(data) {
	console.log('NetworkManager: Received game state from server', data);
	
	// Process received game state
	let processedData = data;
	
	// Check if the data has a different structure (common inconsistency between servers)
	if (data.state) {
		// Format: {gameId: 'x', state: {...}, players: [...]}
		processedData = {
			...data.state,
			players: data.players || [],
			gameId: data.gameId
		};
	}
	
	// Store the game state
	getState().gameState = processedData;
	
	// Emit processed game state to listeners
	emitEvent('game_state', processedData);
	emitMessage('game_state', processedData);
}

/**
 * Handle game update events (smaller updates between full state updates)
 */
function handleGameUpdateEvent(data) {
	console.log('NetworkManager: Received game update from server', data);
	
	// Update our stored state with this update
	if (getState().gameState) {
		// Apply updates to our stored state based on what fields are in the update
		if (data.board) {
			getState().gameState.board = data.board;
		}
		
		if (data.players) {
			getState().gameState.players = data.players;
		}
		
		if (data.chessPieces) {
			getState().gameState.chessPieces = data.chessPieces;
		}
		
		// Add any other important fields from the update
	}
	
	// Emit game update event
	emitEvent('game_update', data);
	emitMessage('game_update', data);
}

// Add all exported functions to the exports object
exports.initialize = initialize;
exports.ensureConnected = ensureConnected;
exports.onMessage = onMessage;
exports.addEventListener = addEventListener;
exports.removeEventListener = removeEventListener;
exports.on = on;
exports.triggerEvent = triggerEvent;
exports.sendMessage = sendMessage;
exports.joinGame = joinGame;
exports.updateGameId = updateGameId;
exports.submitTetrominoPlacement = submitTetrominoPlacement;
exports.submitChessMove = submitChessMove;
exports.getStatus = getStatus;
exports.isConnected = isConnected;
exports.getPlayerId = getPlayerId;
exports.getGameId = getGameId;
exports.requestPlayerList = requestPlayerList;
exports.getGameState = getGameState;
exports.getCurrentGameState = getCurrentGameState;
exports.reconnect = reconnect;
exports.getSocket = getSocket;
exports.startGameStatePolling = startGameStatePolling;
exports.stopGameStatePolling = stopGameStatePolling;

// Export all functions
export default exports;

// Update the window.NetworkManager reference
if (typeof window !== 'undefined') {
	window.NetworkManager = exports;
} 