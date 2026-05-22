/**
 * NetworkManager Class
 * Handles all network communication in the game.
 *
 * Code-shape refactor (May 2026): the bulk of the boilerplate
 * `socket.on('xxx', d => this.emitEvent('xxx', d))` wiring was
 * extracted to `./network/socketEventBridge.js`, and the in-memory
 * event-listener book-keeping (emit / addEventListener /
 * removeEventListener) moved to `./network/eventBus.js`. This file
 * is now focused on the lifecycle (connect / join / leave / actions).
 */
import { attachSimpleForwards } from './network/socketEventBridge.js';
import * as eventBus from './network/eventBus.js';

// socket.io-client is loaded globally by the CDN <script> in index.html.
// Using the global avoids fragile /node_modules/ imports that break behind nginx.
function getSocketIO() {
	if (typeof window !== 'undefined' && window.io) return window.io;
	throw new Error('Socket.IO client not loaded — check CDN script tag in index.html');
}
const io = getSocketIO();

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
					// Honour the user's saved name first; only fall
					// back to a random DevPlayer_ if they really have
					// never set one. The old behaviour overwrote the
					// real localStorage name with `DevPlayer_xxx`,
					// which is half of why "Change Name" was broken
					// (and the other half is why the player list
					// showed "Guest" instead of the typed name).
					let savedName = null;
					try { savedName = localStorage.getItem('playerName') || null; }
					catch (_e) { savedName = null; }
					const autoInitName = (savedName && savedName.trim())
						|| ('DevPlayer_' + Math.floor(Math.random() * 1000));
					this.initialize(autoInitName)
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
				
				// Register core socket listeners immediately (before connect) to avoid missing early events
			socket.on('player_id', (id) => {
				try {
					if (id) {
						this.state.playerId = id;
						this.emitEvent('player_id', { playerId: id });
					}
				} catch (error) {
					console.warn('NetworkManager: Error handling player_id event:', error);
				}
			});

			socket.on('set_session', (data) => {
				if (data && data.playerId) {
					document.cookie = `tetches_player_id=${data.playerId};path=/;max-age=${60 * 60 * 24 * 30};SameSite=Lax`;
					console.log('NetworkManager: Session cookie set for', data.playerId);
				}
			});

			// Wire up the ~30 pass-through events (player_joined,
			// chess_move, powerup_spawned, …) in one go. See
			// `./network/socketEventBridge.js` for the full list.
			attachSimpleForwards(socket, (eventType, payload) => this.emitEvent(eventType, payload));
				
				socket.on('game_state', (data) => {
					this.state.gameState = (data && data.state) ? data.state : data;
					this.emitEvent('game_state', data);
				});

				socket.on('game_update', (data) => {
					const incomingState = (data && data.state) ? data.state : data;
					if (this.state.gameState) {
						this.state.gameState = { ...this.state.gameState, ...incomingState };
					} else {
						this.state.gameState = incomingState;
					}
					this.emitEvent('game_update', incomingState);
				});

				socket.on('connect', () => {
					console.log('NetworkManager: Connected to server');
					this.state.socket = socket;
					this.state.playerName = playerName;
					this.state.isInitializing = false;
					this.state.reconnectAttempts = 0;
					this.state.connectionStatus = 'connected';

					this.emitEvent('connect', { connected: true, playerName: this.state.playerName, playerId: this.state.playerId || socket.id });

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
	 * Name sent with `join_game` — never the literal placeholder `'Guest'`
	 * when the user has already stored a real name.
	 * @private
	 */
	_nameForJoinGame() {
		if (this.state.playerName && this.state.playerName !== 'Guest') {
			return this.state.playerName;
		}
		try {
			const stored = localStorage.getItem('playerName');
			if (stored && stored.trim()) return stored.trim();
		} catch (_e) { /* private browsing */ }
		return this.state.playerName;
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
				if (data.playerName) {
					let resolved = data.playerName;
					const isPlaceholder = !resolved || resolved === 'Guest'
						|| /^Player_[a-f0-9]{6}$/i.test(String(resolved).trim());
					if (isPlaceholder) {
						try {
							const stored = localStorage.getItem('playerName');
							if (stored && stored.trim()) resolved = stored.trim();
						} catch (_e) { /* ignore */ }
					}
					if (resolved && resolved !== 'Guest') {
						this.state.playerName = resolved;
						try { localStorage.setItem('playerName', resolved); }
						catch (_e) { /* ignore */ }
					}
				}
				this.state.hasJoinedGame = true;
				this.state.isJoiningGame = false; // Clear joining flag
				
				// Store game state if it's in the response
				if (data.gameState) {
					console.log('NetworkManager: Game state received in join response:', data.gameState);
					this.state.gameState = data.gameState;
					
					// Also emit a game_state event so listeners can update
					this.emitEvent('game_state', {
						gameId: data.gameId,
						state: data.gameState,
						players: data.players,
						timestamp: data.timestamp || Date.now()
					});
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
			const joinName = this._nameForJoinGame();
			if (gameIdArg) {
				console.log('NetworkManager: Joining specific game:', gameIdArg);
				this.state.socket.emit('join_game', { gameId: gameIdArg, playerName: joinName }, (response) => {
					console.log('NetworkManager: Join specific game response:', gameIdArg, response);
					if (response.error) {
						onJoinError(response.error);
					} else {
						onJoinSuccess(response);
					}
				});
			} else {
				console.log('NetworkManager: Joining global game');
				this.state.socket.emit('join_game', { playerName: joinName }, (response) => {
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
	 * Permanently exit the game, clearing the session cookie.
	 * @returns {Promise<boolean>}
	 */
	exitGame() {
		return new Promise((resolve) => {
			if (this.isConnected() && this.state.socket) {
				this.state.socket.emit('exit_game', {}, () => {
					this._clearSession();
					resolve(true);
				});
				setTimeout(() => {
					this._clearSession();
					resolve(true);
				}, 3000);
			} else {
				this._clearSession();
				resolve(true);
			}
		});
	}

	_clearSession() {
		document.cookie = 'tetches_player_id=;path=/;max-age=0';
		this.state.gameId = null;
		this.state.hasJoinedGame = false;
		this.state.playerId = null;
		localStorage.removeItem('tetches_game_key');
	}

	/**
	 * Send a pawn promotion choice to the server
	 * @param {string} pieceId - The pawn piece ID
	 * @param {string} chosenType - QUEEN, ROOK, BISHOP, or KNIGHT
	 * @returns {Promise<Object>}
	 */
	/**
	 * Bank a promotion credit for `pieceId` (the pawn must already have
	 * walked the full promotion distance). The server-side chess_move
	 * handler now auto-banks credits the moment a pawn finishes its
	 * walk; this method exists for legacy clients and explicit
	 * "promote now" buttons that want to convert before the next move.
	 *
	 * Use `redeemPromotion(...)` afterwards to spend the credit against
	 * a captured-piece basket entry.
	 */
	promotePawn(pieceId) {
		return this.sendMessage('promote_pawn', { pieceId });
	}

	/**
	 * Redeem a banked promotion credit by spawning a captured piece
	 * at the credit's original cell (or nearest-to-king if the cell
	 * is gone). Consumes one matching basket entry. Uses an explicit
	 * callback so the caller's UI can react to success / failure
	 * without waiting on a full state broadcast.
	 *
	 * @param {string} capturedType  'QUEEN' | 'ROOK' | 'BISHOP' | 'KNIGHT'
	 * @param {string} [creditId]    Specific credit to redeem; defaults to oldest.
	 * @param {Function} callback    Invoked with the server ack payload.
	 */
	redeemPromotion(capturedType, creditId, callback) {
		if (!this.isConnected() || !this.socket) {
			if (typeof callback === 'function') {
				callback({ success: false, error: 'Not connected' });
			}
			return;
		}
		const payload = { capturedType };
		if (creditId) payload.creditId = creditId;
		this.socket.emit('redeem_promotion', payload, (ack) => {
			if (typeof callback === 'function') callback(ack);
		});
	}

	/**
	 * Submit response to a King's Duel mini-game.
	 * @param {string} duelId
	 * @param {number} placement - Cell index where the player hid their king (0-7)
	 * @param {number} guess - Cell index where the player guesses opponent hid theirs
	 * @returns {Promise<Object>}
	 */
	submitDuelResponse(duelId, placement, guess) {
		return this.sendMessage('king_duel_response', { duelId, placement, guess });
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
			return Promise.reject({
				message: 'Not connected to server',
				reason: 'network_error'
			});
		}
		
		return new Promise((resolve, reject) => {
			this.state.socket.emit(eventType, data, (response) => {
				if (response && response.error) {
					console.error(`NetworkManager: Error sending message ${eventType}:`, response.error);
					
					// Rate limiting (real-time anti-spam)
					const isRateLimited = response.error === 'rate_limited' || 
						(typeof response.error === 'string' && response.error.includes('rate_limited'));
					
					if (isRateLimited) {
						reject({
							message: 'rate_limited',
							reason: 'rate_limited',
							retryAfterMs: response.retryAfterMs,
							details: response
						});
						return;
					}
					
					// Check if this is a validation error or a network error.
					// IMPORTANT: keep the server-supplied `reason` if present —
					// callers (chess move handler, etc) need to distinguish
					// `piece_gone` / `desync_repaired` from a generic
					// validation_error so they can react properly. Previously
					// every rejection was overwritten to `validation_error`,
					// which is how the "knight just disappeared" stale-state
					// bug went unhandled — the client never knew the server
					// had told it the piece was already gone.
					const errorText = String(response.error);
					const errorLower = errorText.toLowerCase();
					const explicitReason = (typeof response.reason === 'string' && response.reason)
						? response.reason
						: null;

					const isValidationError = (
						errorLower.includes('invalid') ||
						errorLower.includes('not allowed') ||
						errorLower.includes('rejected') ||
						errorLower.includes('not your') ||
						errorLower.includes('not found') ||
						errorLower.includes('cannot') ||
						errorLower.includes('occupied')
					);

					const reason = explicitReason
						|| (isValidationError ? 'validation_error' : 'network_error');

					reject({
						message: errorText,
						reason,
						details: response,
					});
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
			return Promise.reject({
				message: 'Not connected to server',
				reason: 'network_error'
			});
		}
		
		if (!this.state.gameId) {
			console.error('NetworkManager: Cannot submit tetromino placement, not in a game');
			return Promise.reject({
				message: 'Not in a game',
				reason: 'network_error'
			});
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
			// Preserve explicit rate limiting errors
			if (error && error.reason === 'rate_limited') {
				return Promise.reject(error);
			}
			
			// Check if this is a validation error (placement rule violation) or a network error
			if (error.message && (
				error.message.includes('Invalid placement') ||
				error.message.includes('invalid position') ||
				error.message.includes('placement not allowed') ||
				error.message.includes('placement rejected')
			)) {
				console.error('NetworkManager: Tetromino placement validation failed:', error.message);
				// Mark this explicitly as a validation error, not a network error
				return Promise.reject({
					message: error.message,
					reason: 'validation_error',
					error: error
				});
			}
			
			console.error('NetworkManager: Tetromino placement failed:', error);
			return Promise.reject({
				message: error.message || 'Network error during placement',
				reason: 'network_error',
				error: error
			});
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
		
		// Prepare canonical payload for server (server expects pieceId + targetPosition)
		const pieceId = move?.pieceId || move?.id;
		const targetPosition = move?.targetPosition || (
			(move?.toX !== undefined && move?.toZ !== undefined)
				? { x: move.toX, z: move.toZ }
				: null
		);
		
		const moveData = { pieceId, targetPosition };
		
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

	async detonatePawn(pieceId) {
		if (!this.isConnected()) {
			return Promise.reject(new Error('Not connected'));
		}
		if (!this.state.gameId) {
			return Promise.reject(new Error('Not in a game'));
		}
		return this.sendMessage('detonate_pawn', { pieceId });
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
					this.state.gameState = (response && response.state) ? response.state : response;
					
					// Emit game state event
					this.emitEvent('game_state', response);
					
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
	// Event bus is implemented in ./network/eventBus.js — these
	// thin wrappers exist purely so external callers can keep using
	// `NetworkManager.on(...)` / `.emitEvent(...)` syntax.
	emitEvent(eventType, data) { return eventBus.emitEvent(this, eventType, data); }
	addEventListener(eventType, callback) { return eventBus.addEventListener(this, eventType, callback); }
	removeEventListener(eventType, callback) { return eventBus.removeEventListener(this, eventType, callback); }

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

		this.emitEvent('disconnect', { reason });

		if (reason === 'io client disconnect') return;

		const MAX_RECONNECT = 8;
		const BASE_DELAY_MS = 2000;
		const attempt = (this.state.reconnectAttempts || 0) + 1;
		if (attempt > MAX_RECONNECT) {
			console.warn('NetworkManager: Max reconnection attempts reached');
			return;
		}
		this.state.reconnectAttempts = attempt;
		const delay = Math.min(BASE_DELAY_MS * Math.pow(1.5, attempt - 1), 30000);
		console.log(`NetworkManager: Reconnecting in ${Math.round(delay)}ms (attempt ${attempt}/${MAX_RECONNECT})`);
		setTimeout(() => {
			if (this.state.connectionStatus === 'connected') return;
			this.ensureConnected(this.state.playerName).catch(err => {
				console.warn('NetworkManager: Reconnection attempt failed:', err);
			});
		}, delay);
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