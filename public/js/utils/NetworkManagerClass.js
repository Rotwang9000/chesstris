/**
 * NetworkManager Class
 * Handles all network communication in the game.
 */
import io from '/node_modules/socket.io-client/dist/socket.io.esm.min.js';

// Configuration Constants
const CONNECTION_TIMEOUT_MS = 10000; // 10 seconds
const JOIN_GAME_TIMEOUT_MS = 15000;   // 15 seconds
const LEAVE_GAME_TIMEOUT_MS = 3000;  // 3 seconds
const MAX_RECONNECT_INTERVAL_MS = 30000; // 30 seconds
const API_BASE_URL = '/api'; // Default to same-origin API
const SOCKET_URL = ''; // Empty string means connect to the same server
const POLL_INTERVAL = 5000; // 5 seconds

export default class NetworkManager {
	constructor() {
		this.state = {
			socket: null,
			gameId: null,
			playerId: null,
			playerName: null,
			connectionStatus: 'disconnected',
			messageHandlers: {},
			reconnectAttempts: 0,
			maxReconnectAttempts: Infinity,
			isInitializing: false,
			isJoiningGame: false,
			hasJoinedGame: false,
			lastConnectionAttempt: 0,
			connectionThrottleMs: 2000,
			gameState: null,
			hasAutoInitialized: false,
			gameStatePollingEnabled: false,
			gameStatePollingInterval: null,
			lastUpdateTimestamp: 0,
			eventListeners: {
				// Standard event types - these are arrays
				connect: [],
				disconnect: [],
				error: [],
				connecting: [],
				game_state: [],
				game_update: [],
				player_joined: [],
				player_left: [],
				message: [], // General message handlers
				// Message type specific handlers
				messageHandlers: {}
			}
		};

		// Auto-initialize in development mode
		if (typeof window !== 'undefined') {
			// Use a longer delay to allow for any manual initialization to take precedence
			setTimeout(() => {
				// Only auto-initialize if not already done and not already connected
				const isDevMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
				if (isDevMode && !this.state.hasAutoInitialized && !this.isConnected() && !this.state.isInitializing) {
					// Set flag immediately to prevent multiple auto-init attempts
					this.state.hasAutoInitialized = true;
					console.log('NetworkManager: Starting auto-initialization in development mode');
					const mockPlayerName = 'DevPlayer_' + Math.floor(Math.random() * 1000);
					this.initialize(mockPlayerName)
						.then(() => {
							console.log('NetworkManager: Auto-initialized in development mode');
							// Only join if we're not already joining and not already in a game
							if (!this.state.isJoiningGame && !this.state.hasJoinedGame) {
								return this.joinGame();
							} else {
								console.log('NetworkManager: Already joining or in a game, skipping auto-join');
								return Promise.resolve(null);
							}
						})
						.then(gameData => {
							if (gameData) {
								console.log('NetworkManager: Auto-joined game in development mode:', gameData);
							}
						})
						.catch(error => {
							console.warn('NetworkManager: Auto-initialization failed:', error);
						});
				}
			}, 1500); // Increased delay to allow manual init to happen first
		}
	}

	/**
	 * Initialize the network connection
	 * @param {string} playerName - Player name
	 * @returns {Promise<boolean>} - Promise that resolves to true if successful
	 */
	initialize(playerName = 'Guest') {
		// Check if already initializing to prevent multiple simultaneous initializations
		if (this.state.isInitializing) {
			console.log('NetworkManager: Already initializing, returning existing promise');
			return new Promise((resolve) => {
				// Check status every 100ms until initialization completes
				const checkInterval = setInterval(() => {
					if (!this.state.isInitializing) {
						clearInterval(checkInterval);
						resolve(this.state.socket && this.state.socket.connected);
					}
				}, 100);
			});
		}
		
		// Check if already connected
		if (this.state.socket && this.state.socket.connected) {
			console.log('NetworkManager: Already connected');
			
			// Update player name if different
			if (this.state.playerName !== playerName) {
				this.state.playerName = playerName;
				console.log(`NetworkManager: Updated player name to ${playerName}`);
			}
			
			// Ensure connection status is correctly set
			this.state.connectionStatus = 'connected';
			this.emitEvent('connect', { connected: true, playerName: this.state.playerName, playerId: this.state.playerId });
			
			return Promise.resolve(true);
		}
		
		// Throttle reconnection attempts to prevent overloading the server
		const now = Date.now();
		if (this.state.reconnectAttempts > 0) {
			const timeSinceLastReconnect = now - this.state.lastReconnectTime;
			const minReconnectInterval = Math.min(1000 * Math.pow(2, this.state.reconnectAttempts - 1), MAX_RECONNECT_INTERVAL_MS);
			
			if (timeSinceLastReconnect < minReconnectInterval) {
				const waitTime = minReconnectInterval - timeSinceLastReconnect;
				console.log(`NetworkManager: Throttling reconnection attempt. Waiting ${waitTime}ms`);
				
				return new Promise(resolve => {
					setTimeout(() => {
						resolve(this.initialize(playerName));
					}, waitTime);
				});
			}
		}
		
		// Update reconnection tracking
		this.state.reconnectAttempts++;
		this.state.lastReconnectTime = now;
		this.state.isInitializing = true; // Mark as initializing
		
		// Set connection status
		this.state.connectionStatus = 'connecting';
		this.emitEvent('connecting', { connecting: true, playerName: playerName });
		
		return new Promise((resolve, reject) => {
			try {
				// Clean up existing socket if present
				if (this.state.socket) {
					console.log('NetworkManager: Cleaning up existing socket');
					this.state.socket.off();
					this.state.socket.disconnect();
					this.state.socket = null;
				}
				
				// Determine server URL based on environment
				const socketUrl = this.determineServerUrl();
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
					this.state.socket = socket;
					this.state.playerName = playerName;
					this.state.isInitializing = false;
					this.state.reconnectAttempts = 0; // Reset counter on successful connection
					this.state.connectionStatus = 'connected';
					
					// Emit connect event to listeners
					this.emitEvent('connect', { connected: true, playerName: this.state.playerName, playerId: this.state.playerId || socket.id });
					
					// Set up game state event handlers
					socket.on('game_state', (data) => {
						console.log('NetworkManager: Received game_state event:', data);
						this.state.gameState = data;
						this.emitEvent('game_state', data);
					});
					
					socket.on('game_update', (data) => {
						console.log('NetworkManager: Received game_update event:', data);
						// Update our cached game state with new data if possible
						if (this.state.gameState) {
							this.state.gameState = { ...this.state.gameState, ...data };
						}
						this.emitEvent('game_update', data);
					});
					
					resolve(true);
				});
				
				socket.on('disconnect', (reason) => {
					this.handleSocketDisconnect(reason);
				});
				
				socket.on('error', (error) => {
					this.handleSocketError(error);
					reject(error);
				});
				
				socket.on('connect_error', (error) => {
					console.error('NetworkManager: Connection error:', error);
					this.state.isInitializing = false;
					this.state.connectionStatus = 'error';
					
					this.emitEvent('error', { error: 'connection_error', details: error });
					
					reject(error);
				});
				
				// Set connection timeout
				const timeout = setTimeout(() => {
					if (this.state.isInitializing) {
						console.error('NetworkManager: Connection timeout after', CONNECTION_TIMEOUT_MS, 'ms');
						this.state.isInitializing = false;
						this.state.connectionStatus = 'timeout';
						
						this.emitEvent('error', { error: 'connection_timeout' });
						
						// Clean up socket
						if (socket) {
							socket.off();
							socket.disconnect();
						}
						
						reject(new Error('Connection timeout'));
					}
				}, CONNECTION_TIMEOUT_MS);
				
				// Clear timeout on connect or error
				socket.on('connect', () => clearTimeout(timeout));
				socket.on('error', () => clearTimeout(timeout));
				socket.on('connect_error', () => clearTimeout(timeout));
				
			} catch (error) {
				console.error('NetworkManager: Error during initialization:', error);
				this.state.isInitializing = false;
				this.state.connectionStatus = 'error';
				
				this.emitEvent('error', { error: 'initialization_error', details: error });
				
				reject(error);
			}
		});
	}

	/**
	 * Determine the server URL based on environment
	 * @private
	 * @returns {string} - Server URL
	 */
	determineServerUrl() {
		// If explicit socket URL is provided, use it
		if (SOCKET_URL) {
			return SOCKET_URL;
		}
		
		// Otherwise use current origin
		if (typeof window !== 'undefined') {
			// For local development, use explicit localhost with port
			if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
				// Use the same port as the current page
				return `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
			}
			
			// For production, use current origin
			return window.location.origin;
		}
		
		// Fallback
		return 'http://localhost:3000';
	}

	/**
	 * Ensure the client is connected
	 * @param {string} playerNameArg - Optional player name
	 * @param {number} maxAttempts - Maximum number of connection attempts
	 * @returns {Promise<boolean>} - Promise that resolves to true if connected
	 */
	async ensureConnected(playerNameArg = null, maxAttempts = 3) {
		const playerName = playerNameArg || this.state.playerName || 'Guest';
		
		// If already connected, return immediately
		if (this.isConnected()) {
			return Promise.resolve(true);
		}

		// If already initializing or reconnecting, wait for that to complete
		if (this.state.isInitializing) {
			console.log('NetworkManager: Connection already in progress, waiting for completion');
			return new Promise((resolve) => {
				// Check status every 100ms until initialization completes
				const checkInterval = setInterval(() => {
					if (!this.state.isInitializing) {
						clearInterval(checkInterval);
						resolve(this.isConnected());
					}
				}, 100);
			});
		}
		
		console.log('NetworkManager: Connection check - not connected, attempting to connect');
		
		// Attempt to connect with exponential backoff
		let attempt = 1;
		
		const attemptReconnectWithBackoff = async (attempt) => {
			if (attempt > maxAttempts) {
				console.error(`NetworkManager: Failed to connect after ${maxAttempts} attempts`);
				return false;
			}
			
			try {
				// Initialize with player name
				console.log(`NetworkManager: Connection attempt ${attempt} of ${maxAttempts}`);
				const result = await this.initialize(playerName);
				
				if (result) {
					console.log(`NetworkManager: Successfully connected on attempt ${attempt}`);
					return true;
				}
			} catch (error) {
				console.error(`NetworkManager: Connection attempt ${attempt} failed:`, error);
				
				// Exponential backoff
				const backoffTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
				console.log(`NetworkManager: Retrying in ${backoffTime}ms...`);
				
				await new Promise(resolve => setTimeout(resolve, backoffTime));
				return attemptReconnectWithBackoff(attempt + 1);
			}
			
			return false;
		};
		
		return attemptReconnectWithBackoff(attempt);
	}

	/**
	 * Join a game
	 * @param {string} gameIdArg - Optional game ID to join
	 * @returns {Promise<Object>} - Promise that resolves to game data
	 */
	joinGame(gameIdArg) {
		// If already joining a game, wait for that process to complete
		if (this.state.isJoiningGame) {
			console.log('NetworkManager: Already joining a game, waiting for completion');
			return new Promise((resolve, reject) => {
				// Check status every 100ms until join completes
				const checkInterval = setInterval(() => {
					if (!this.state.isJoiningGame) {
						clearInterval(checkInterval);
						if (this.state.hasJoinedGame && this.state.gameId) {
							resolve({
								success: true,
								gameId: this.state.gameId,
								playerId: this.state.playerId,
								playerName: this.state.playerName
							});
						} else {
							reject(new Error('Join game process failed'));
						}
					}
				}, 100);
			});
		}

		// If already in a game, just return the current game info
		if (this.state.hasJoinedGame && this.state.gameId) {
			console.log('NetworkManager: Already in a game, returning current game info');
			return Promise.resolve({
				success: true,
				gameId: this.state.gameId,
				playerId: this.state.playerId,
				playerName: this.state.playerName
			});
		}

		if (!this.isConnected()) {
			console.error('NetworkManager: Cannot join game, not connected');
			return this.ensureConnected(this.state.playerName)
				.then(connected => {
					if (connected) {
						return this._joinGameInner(gameIdArg);
					}
					return Promise.reject(new Error('Failed to connect'));
				});
		}
		console.log('NetworkManager: Joining game, already connected', gameIdArg);
		return this._joinGameInner(gameIdArg);
	}

	/**
	 * Inner implementation of joinGame
	 * @private
	 * @param {string} gameIdArg - Optional game ID to join
	 * @returns {Promise<Object>} - Promise that resolves to game data
	 */
	_joinGameInner(gameIdArg) {
		console.log(`NetworkManager: Attempting to join game ${gameIdArg || 'or create new game'}`);
		
		// Set flag to indicate we're joining a game
		this.state.isJoiningGame = true;
		
		return new Promise((resolve, reject) => {
			// Set timeout for joining game
			const timeout = setTimeout(() => {
				this.state.isJoiningGame = false;
				reject(new Error('Join game timeout'));
			}, JOIN_GAME_TIMEOUT_MS);
			
			// Create success and error handlers
			const onJoinSuccess = (data) => {
				clearTimeout(timeout);
				
				console.log('NetworkManager: Successfully joined game:', data);
				
				// Store game ID
				this.state.gameId = data.gameId;
				this.state.playerId = data.playerId;
				this.state.hasJoinedGame = true;
				this.state.isJoiningGame = false; // Clear joining flag
				
				// Store game state if it's in the response
				if (data.gameState) {
					console.log('NetworkManager: Game state received in join response:', data.gameState);
					this.state.gameState = data.gameState;
					
					// Also emit a game_state event so listeners can update
					this.emitEvent('game_state', data.gameState);
				} else {
					console.log('NetworkManager: No game state in join response, requesting state...');
					// If no game state in the response, request it
					setTimeout(() => {
						this.getGameState().catch(error => {
							console.warn('NetworkManager: Failed to get initial game state:', error);
						});
					}, 500);
				}
				
				// Emit game joined event
				this.emitEvent('gameJoined', data);
				
				resolve(data);
			};
			
			const onJoinError = (error) => {
				clearTimeout(timeout);
				console.error('NetworkManager: Error joining game:', error);
				
				// Clear joining flag
				this.state.isJoiningGame = false;
				
				// Emit error event
				this.emitEvent('error', { error: 'join_game_error', details: error });
				
				reject(error);
			};
			
			// Send join request
			if (gameIdArg) {
				console.log('NetworkManager: Joining specific game:', gameIdArg);
				// Join specific game
				this.state.socket.emit('join_game', { gameId: gameIdArg, playerName: this.state.playerName }, (response) => {
					console.log('NetworkManager: Join specific game response:', gameIdArg, response);
					if (response.error) {
						onJoinError(response.error);
					} else {
						onJoinSuccess(response);
					}
				});
			} else {
				console.log('NetworkManager: Joining global game');
				// Join any available game or create new
				this.state.socket.emit('join_game', { playerName: this.state.playerName }, (response) => {
					console.log('NetworkManager: Join any available game response:', response);
					if (response.error) {
						onJoinError(response.error);
					} else {
						onJoinSuccess(response);
					}
				});
			}
		});
	}

	/**
	 * Leave the current game
	 * @returns {Promise<boolean>} - Promise that resolves to true if successful
	 */
	leaveGame() {
		// If not connected or not in a game, resolve immediately
		if (!this.isConnected() || !this.state.gameId) {
			console.log('NetworkManager: Not in a game, nothing to leave');
			this.state.gameId = null;
			this.state.hasJoinedGame = false;
			return Promise.resolve(true);
		}
		
		console.log(`NetworkManager: Leaving game ${this.state.gameId}`);
		
		return new Promise((resolve, reject) => {
			// Set timeout for leaving game
			const timeout = setTimeout(() => {
				// If timeout, still consider it successful but log warning
				console.warn('NetworkManager: Leave game timeout, assuming successful');
				this.state.gameId = null;
				this.state.hasJoinedGame = false;
				resolve(true);
			}, LEAVE_GAME_TIMEOUT_MS);
			
			// Send leave request - first try disconnect_game which may be the server's actual event name
			// If that doesn't exist, the socket timeout will handle it gracefully
			this.state.socket.emit('disconnect_game', { gameId: this.state.gameId }, (response) => {
				clearTimeout(timeout);
				
				if (response && response.error) {
					console.error('NetworkManager: Error leaving game:', response.error);
					
					// Emit error event
					this.emitEvent('error', { error: 'leave_game_error', details: response.error });
					
					// Still consider it left on client side
					this.state.gameId = null;
					this.state.hasJoinedGame = false;
					
					reject(response.error);
				} else {
					console.log('NetworkManager: Successfully left game');
					
					// Clear game ID
					this.state.gameId = null;
					this.state.hasJoinedGame = false;
					
					// Emit game left event
					this.emitEvent('gameLeft', {});
					
					resolve(true);
				}
			});
		});
	}

	/**
	 * Send a message to the server
	 * @param {string} eventType - Event type
	 * @param {Object} data - Event data
	 * @returns {Promise<any>} - Promise that resolves to server response
	 */
	sendMessage(eventType, data) {
		if (!this.isConnected()) {
			console.error(`NetworkManager: Cannot send message ${eventType}, not connected`);
			return Promise.reject(new Error('Not connected'));
		}
		
		return new Promise((resolve, reject) => {
			this.state.socket.emit(eventType, data, (response) => {
				if (response && response.error) {
					console.error(`NetworkManager: Error sending message ${eventType}:`, response.error);
					reject(response.error);
				} else {
					resolve(response);
				}
			});
		});
	}

	/**
	 * Submit a tetromino placement
	 * @param {Object} tetromino - Tetromino data
	 * @returns {Promise<Object>} - Promise that resolves to server response
	 */
	async submitTetrominoPlacement(tetromino) {
		if (!this.isConnected()) {
			console.error('NetworkManager: Cannot submit tetromino placement, not connected');
			return Promise.reject(new Error('Not connected'));
		}
		
		if (!this.state.gameId) {
			console.error('NetworkManager: Cannot submit tetromino placement, not in a game');
			return Promise.reject(new Error('Not in a game'));
		}
		
		console.log('NetworkManager: Submitting tetromino placement:', tetromino);
		
		// Prepare data for server
		const placementData = {
			gameId: this.state.gameId,
			playerId: this.getPlayerId(),
			tetromino: tetromino
		};
		
		// Send placement to server
		try {
			const response = await this.sendMessage('tetromino_placed', placementData);
			console.log('NetworkManager: Tetromino placement successful:', response);
			return response;
		} catch (error) {
			console.error('NetworkManager: Tetromino placement failed:', error);
			throw error;
		}
	}

	/**
	 * Submit a chess move
	 * @param {Object} move - Chess move data
	 * @returns {Promise<Object>} - Promise that resolves to server response
	 */
	async submitChessMove(move) {
		if (!this.isConnected()) {
			console.error('NetworkManager: Cannot submit chess move, not connected');
			return Promise.reject(new Error('Not connected'));
		}
		
		if (!this.state.gameId) {
			console.error('NetworkManager: Cannot submit chess move, not in a game');
			return Promise.reject(new Error('Not in a game'));
		}
		
		console.log('NetworkManager: Submitting chess move:', move);
		
		// Prepare data for server
		const moveData = {
			gameId: this.state.gameId,
			playerId: this.getPlayerId(),
			move: move
		};
		
		// Send move to server
		try {
			const response = await this.sendMessage('chess_move', moveData);
			console.log('NetworkManager: Chess move successful:', response);
			return response;
		} catch (error) {
			console.error('NetworkManager: Chess move failed:', error);
			throw error;
		}
	}

	/**
	 * Get the current game state
	 * @param {Object} options - Options for the request
	 * @returns {Promise<Object>} - Promise that resolves to game state
	 */
	getGameState(options = {}) {
		if (!this.isConnected()) {
			console.warn('NetworkManager: Cannot get game state, not connected');
			return Promise.reject(new Error('Not connected'));
		}
		
		if (!this.state.gameId) {
			console.warn('NetworkManager: Cannot get game state, not in a game');
			return Promise.reject(new Error('Not in a game'));
		}
		
		// Default options
		const defaultOptions = {
			includeBoard: true,
			includeChat: true,
			includePlayers: true,
			includePhase: true,
			includeChessPieces: true,
			includeTetrominos: true
		};
		
		// Merge with provided options
		const requestOptions = { ...defaultOptions, ...options };
		
		// Prepare request data
		const requestData = {
			gameId: this.state.gameId,
			playerId: this.getPlayerId(),
			options: requestOptions,
			lastUpdateTimestamp: this.state.lastUpdateTimestamp || 0
		};
		
		return new Promise((resolve, reject) => {
			// Send request
			this.state.socket.emit('get_game_state', requestData, (response) => {
				if (response && response.error) {
					console.error('NetworkManager: Error getting game state:', response.error);
					reject(response.error);
				} else {
					// Update last update timestamp
					if (response && response.timestamp) {
						this.state.lastUpdateTimestamp = response.timestamp;
					}
					
					// Cache game state
					this.state.gameState = response;
					
					// Emit game state event
					this.emitEvent('gameState', response);
					
					resolve(response);
				}
			});
		});
	}

	/**
	 * Get the current cached game state
	 * @returns {Object|null} - Current cached game state or null if not available
	 */
	getCurrentGameState() {
		return this.state.gameState;
	}

	/**
	 * Emit an event to all listeners
	 * @private
	 * @param {string} eventType - Event type
	 * @param {Object} data - Event data
	 */
	emitEvent(eventType, data) {
		// Ensure eventListeners object exists with proper structure
		if (!this.state.eventListeners) {
			this.state.eventListeners = {};
		}
		
		// Special handling for gameJoined event to include game state
		if (eventType === 'gameJoined' && data && !data.gameState && this.state.gameState) {
			// Clone the data to avoid modifying the original
			data = { ...data, gameState: this.state.gameState };
		}
		
		// Ensure all standard event types have arrays
		const standardEventTypes = [
			'connect', 'disconnect', 'error', 'connecting', 
			'game_state', 'game_update', 'player_joined', 'player_left', 'message',
			'gameJoined', 'gameLeft'
		];
		
		standardEventTypes.forEach(type => {
			if (!this.state.eventListeners[type]) {
				this.state.eventListeners[type] = [];
			}
		});
		
		// Ensure message handlers object exists
		if (!this.state.eventListeners.messageHandlers) {
			this.state.eventListeners.messageHandlers = {};
		}
		
		// Handle 'message' events differently, they have type-specific handlers
		if (eventType === 'message' && data && data.type) {
			const messageType = data.type;
			
			// First call generic message handlers
			if (Array.isArray(this.state.eventListeners.message)) {
				this.state.eventListeners.message.forEach(handler => {
					try {
						handler(data);
					} catch (error) {
						console.error(`NetworkManager: Error in message handler:`, error);
					}
				});
			}
			
			// Then call type-specific handlers
			if (this.state.eventListeners.messageHandlers[messageType] && 
				Array.isArray(this.state.eventListeners.messageHandlers[messageType])) {
				
				this.state.eventListeners.messageHandlers[messageType].forEach(handler => {
					try {
						handler(data);
					} catch (error) {
						console.error(`NetworkManager: Error in message handler for ${messageType}:`, error);
					}
				});
			}
			return;
		}
		
		// For other events, ensure the array exists
		if (!this.state.eventListeners[eventType]) {
			this.state.eventListeners[eventType] = [];
		}
		
		// Call each handler
		if (Array.isArray(this.state.eventListeners[eventType])) {
			this.state.eventListeners[eventType].forEach(handler => {
				try {
					handler(data);
				} catch (error) {
					console.error(`NetworkManager: Error in event handler for ${eventType}:`, error);
				}
			});
		} else {
			console.warn(`NetworkManager: Event listeners for ${eventType} is not an array`);
		}
		
		// Also emit corresponding DOM event for compatibility
		if (typeof document !== 'undefined') {
			try {
				const customEvent = new CustomEvent(`network:${eventType}`, { detail: data });
				document.dispatchEvent(customEvent);
			} catch (error) {
				console.warn(`NetworkManager: Error dispatching DOM event ${eventType}:`, error);
			}
		}
	}

	/**
	 * Add an event listener
	 * @param {string} eventType - Event type
	 * @param {Function} callback - Event callback
	 */
	addEventListener(eventType, callback) {
		// Ensure eventListeners object exists
		if (!this.state.eventListeners) {
			this.state.eventListeners = {};
		}
		
		// Handle special message event types with prefix
		if (eventType.startsWith('message:')) {
			const messageType = eventType.substring('message:'.length);
			
			// Ensure messageHandlers object exists
			if (!this.state.eventListeners.messageHandlers) {
				this.state.eventListeners.messageHandlers = {};
			}
			
			// Ensure array for this message type exists
			if (!this.state.eventListeners.messageHandlers[messageType]) {
				this.state.eventListeners.messageHandlers[messageType] = [];
			}
			
			// Add the callback
			this.state.eventListeners.messageHandlers[messageType].push(callback);
			return;
		}
		
		// For normal events, ensure the array exists
		if (!this.state.eventListeners[eventType]) {
			this.state.eventListeners[eventType] = [];
		}
		
		// Add the callback
		this.state.eventListeners[eventType].push(callback);
	}

	/**
	 * Remove an event listener
	 * @param {string} eventType - Event type
	 * @param {Function} callback - Event callback to remove
	 */
	removeEventListener(eventType, callback) {
		// Ensure eventListeners object exists
		if (!this.state.eventListeners) {
			return;
		}
		
		// Handle special message event types
		if (eventType.startsWith('message:')) {
			const messageType = eventType.substring('message:'.length);
			
			// Ensure messageHandlers object exists
			if (!this.state.eventListeners.messageHandlers) {
				return;
			}
			
			// If handlers exist for this message type, filter out the callback
			if (this.state.eventListeners.messageHandlers[messageType]) {
				this.state.eventListeners.messageHandlers[messageType] = 
					this.state.eventListeners.messageHandlers[messageType].filter(handler => handler !== callback);
			}
			return;
		}
		
		// For normal events, filter out the callback if the array exists
		if (this.state.eventListeners[eventType]) {
			this.state.eventListeners[eventType] = 
				this.state.eventListeners[eventType].filter(handler => handler !== callback);
		}
	}

	/**
	 * Alias for addEventListener
	 */
	on(eventType, callback) {
		this.addEventListener(eventType, callback);
	}

	/**
	 * Listen for a specific message type
	 * @param {string} messageType - Message type
	 * @param {Function} handler - Message handler
	 */
	onMessage(messageType, handler) {
		this.addEventListener(`message:${messageType}`, handler);
	}

	/**
	 * Check if the client is connected
	 * @returns {boolean} - Whether the client is connected
	 */
	isConnected() {
		const socketConnected = this.state.socket && this.state.socket.connected;
		
		// Update connectionStatus to match actual socket state
		if (socketConnected && this.state.connectionStatus !== 'connected') {
			console.log('NetworkManager: Fixing inconsistent connection status: was', 
				this.state.connectionStatus, 'but socket is connected');
			this.state.connectionStatus = 'connected';
		} else if (!socketConnected && this.state.connectionStatus === 'connected') {
			console.log('NetworkManager: Fixing inconsistent connection status: was connected but socket is disconnected');
			this.state.connectionStatus = 'disconnected';
		}
		
		return socketConnected;
	}

	/**
	 * Get current connection status
	 * @returns {string} - Current connection status
	 */
	getStatus() {
		// First, verify that status matches actual connection
		this.isConnected();
		return this.state.connectionStatus;
	}

	/**
	 * Get the player ID
	 * @returns {string|null} - Player ID or null if not connected
	 */
	getPlayerId() {
		return this.state.playerId || (this.state.socket ? this.state.socket.id : null);
	}

	/**
	 * Get the game ID
	 * @returns {string|null} - Game ID or null if not in a game
	 */
	getGameId() {
		return this.state.gameId;
	}

	/**
	 * Get the socket instance
	 * @returns {Object|null} - Socket.io socket or null if not connected
	 */
	getSocket() {
		return this.state.socket;
	}

	/**
	 * Handle socket disconnect event
	 * @private
	 * @param {string} reason - Disconnect reason
	 */
	handleSocketDisconnect(reason) {
		console.warn('NetworkManager: Disconnected from server:', reason);
		
		this.state.connectionStatus = 'disconnected';
		
		// Emit disconnect event
		this.emitEvent('disconnect', { reason });
	}

	/**
	 * Handle socket error event
	 * @private
	 * @param {Error} error - Socket error
	 */
	handleSocketError(error) {
		console.error('NetworkManager: Socket error:', error);
		
		this.state.connectionStatus = 'error';
		
		// Emit error event
		this.emitEvent('error', { error: 'socket_error', details: error });
	}

	/**
	 * Start polling for game state updates
	 * @param {number} intervalMs - Polling interval in milliseconds
	 * @returns {boolean} - Whether polling was started
	 */
	startGameStatePolling(intervalMs = POLL_INTERVAL) {
		// Don't start if already polling
		if (this.state.gameStatePollingInterval) {
			console.log('NetworkManager: Game state polling already active');
			return false;
		}
		
		// Make sure we're in a game
		if (!this.state.gameId) {
			console.warn('NetworkManager: Cannot start polling, not in a game');
			return false;
		}
		
		console.log(`NetworkManager: Starting game state polling every ${intervalMs}ms`);
		this.state.gameStatePollingEnabled = true;
		
		// Immediately request initial state
		this.getGameState().catch(error => {
			console.warn('NetworkManager: Error getting initial game state for polling:', error);
		});
		
		// Set up interval for polling
		this.state.gameStatePollingInterval = setInterval(() => {
			if (this.state.gameStatePollingEnabled && this.isConnected() && this.state.gameId) {
				this.getGameState().catch(error => {
					console.warn('NetworkManager: Error polling game state:', error);
					
					// If too many consecutive errors, stop polling
					this.state.gameStatePollingErrors = (this.state.gameStatePollingErrors || 0) + 1;
					if (this.state.gameStatePollingErrors > 5) {
						console.error('NetworkManager: Too many polling errors, stopping polling');
						this.stopGameStatePolling();
					}
				});
			} else if (!this.isConnected() || !this.state.gameId) {
				// Stop polling if disconnected or no game
				console.warn('NetworkManager: No longer connected or in a game, stopping polling');
				this.stopGameStatePolling();
			}
		}, intervalMs);
		
		return true;
	}
	
	/**
	 * Stop polling for game state updates
	 * @returns {boolean} - Whether polling was stopped
	 */
	stopGameStatePolling() {
		if (this.state.gameStatePollingInterval) {
			console.log('NetworkManager: Stopping game state polling');
			clearInterval(this.state.gameStatePollingInterval);
			this.state.gameStatePollingInterval = null;
			this.state.gameStatePollingEnabled = false;
			this.state.gameStatePollingErrors = 0;
			return true;
		}
		return false;
	}
} 