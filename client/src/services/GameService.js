import io from 'socket.io-client';

/**
 * GameService - Handles all game-related networking functionality
 */
class GameService {
	constructor() {
		this.socket = null;
		this.connected = false;
		this.callbacks = {};
		this.playerId = null;
	}
	
	/**
	 * Connect to the game server
	 * @returns {GameService} This instance for chaining
	 */
	connect() {
		if (this.socket) {
			return this;
		}
		
		// Create socket connection
		this.socket = io();
		
		// Set up basic event handlers
		this.socket.on('connect', () => {
			console.log('Connected to game server');
			this.connected = true;
			this._triggerCallback('connect');
		});
		
		this.socket.on('disconnect', () => {
			console.log('Disconnected from game server');
			this.connected = false;
			this._triggerCallback('disconnect');
		});
		
		this.socket.on('error', (error) => {
			console.error('Socket error:', error);
			this._triggerCallback('error', error);
		});
		
		this.socket.on('player_id', (id) => {
			this.playerId = id;
			console.log('Received player ID:', id);
			this._triggerCallback('player_id', id);
		});
		
		// Game state events
		this.socket.on('game_update', (state) => {
			this._triggerCallback('gameState', state);
		});
		
		this.socket.on('player_joined', (data) => {
			this._triggerCallback('playerJoined', data);
		});
		
		this.socket.on('player_left', (data) => {
			this._triggerCallback('playerLeft', data);
		});
		
		this.socket.on('tetromino_placed', (data) => {
			this._triggerCallback('tetrominoPlaced', data);
		});
		
		this.socket.on('chess_move', (data) => {
			this._triggerCallback('chessMove', data);
		});
		
		this.socket.on('turn_update', (data) => {
			this._triggerCallback('turnUpdate', data);
		});
		
		this.socket.on('row_cleared', (data) => {
			this._triggerCallback('rowCleared', data);
		});
		
		this.socket.on('pawn_promoted', (data) => {
			this._triggerCallback('pawnPromoted', data);
		});
		
		this.socket.on('game_over', (data) => {
			this._triggerCallback('gameOver', data);
		});
		
		this.socket.on('spectator_update', (data) => {
			this._triggerCallback('spectatorUpdate', data);
		});
		
		return this;
	}
	
	/**
	 * Disconnect from the game server
	 */
	disconnect() {
		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
			this.connected = false;
		}
	}
	
	/**
	 * Register an event handler
	 * @param {string} event - Event name
	 * @param {Function} callback - Event handler
	 * @returns {GameService} This instance for chaining
	 */
	on(event, callback) {
		if (!this.callbacks[event]) {
			this.callbacks[event] = [];
		}
		this.callbacks[event].push(callback);
		return this;
	}
	
	/**
	 * Remove an event handler
	 * @param {string} event - Event name
	 * @param {Function} [callback] - Event handler to remove (if not provided, all handlers for this event are removed)
	 * @returns {GameService} This instance for chaining
	 */
	off(event, callback) {
		if (!this.callbacks[event]) {
			return this;
		}
		
		if (!callback) {
			delete this.callbacks[event];
		} else {
			this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
		}
		
		return this;
	}
	
	/**
	 * Join an existing game
	 * @param {string} gameId - Game ID to join
	 * @param {string} [playerName] - Player's name
	 * @returns {Promise} Resolves with game info or rejects with error
	 */
	joinGame(gameId, playerName) {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.connected) {
				reject(new Error('Not connected to server'));
				return;
			}
			
			this.socket.emit('join_game', gameId, playerName, (response) => {
				if (response.success) {
					resolve(response);
				} else {
					reject(new Error(response.error || 'Failed to join game'));
				}
			});
		});
	}
	
	/**
	 * Create a new game
	 * @param {Object} settings - Game settings
	 * @returns {Promise} Resolves with game info or rejects with error
	 */
	createGame(settings = {}) {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.connected) {
				reject(new Error('Not connected to server'));
				return;
			}
			
			this.socket.emit('create_game', settings, (response) => {
				if (response.success) {
					resolve(response);
				} else {
					reject(new Error(response.error || 'Failed to create game'));
				}
			});
		});
	}
	
	/**
	 * Request to spectate a player
	 * @param {string} playerId - Player ID to spectate
	 * @returns {Promise} Resolves when successful or rejects with error
	 */
	requestSpectate(playerId) {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.connected) {
				reject(new Error('Not connected to server'));
				return;
			}
			
			this.socket.emit('request_spectate', { playerId });
			resolve(); // Since there's no callback for this event
		});
	}
	
	/**
	 * Stop spectating
	 * @returns {Promise} Resolves when successful
	 */
	stopSpectating() {
		return new Promise((resolve) => {
			if (this.socket && this.connected) {
				this.socket.emit('stop_spectating');
			}
			resolve();
		});
	}
	
	/**
	 * Get valid moves for a chess piece
	 * @param {Object} params - Parameters
	 * @param {string} params.pieceId - Piece ID
	 * @returns {Promise} Resolves with valid moves or rejects with error
	 */
	getValidMoves(params) {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.connected) {
				reject(new Error('Not connected to server'));
				return;
			}
			
			this.socket.emit('get_valid_moves', params, (response) => {
				if (response.success) {
					resolve(response.moves);
				} else {
					reject(new Error(response.error || 'Failed to get valid moves'));
				}
			});
		});
	}
	
	/**
	 * Place a tetromino on the board
	 * @param {Object} params - Parameters for tetromino placement
	 * @returns {Promise} Resolves with placement result or rejects with error
	 */
	placeTetromino(params) {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.connected) {
				reject(new Error('Not connected to server'));
				return;
			}
			
			console.log('Sending tetromino placement to server:', params);
			
			// Format the data for the server
			const placementData = {
				pieceType: params.pieceType,
				position: params.position,
				rotation: params.rotation
			};
			
			// Send the placement request to the server
			this.socket.emit('tetromino_placed', placementData, (response) => {
				if (response && response.success) {
					console.log('Tetromino placement successful:', response);
					resolve(response);
				} else {
					console.error('Tetromino placement failed:', response?.error || 'Unknown error');
					reject(new Error(response?.error || 'Failed to place tetromino'));
				}
			});
		});
	}
	
	/**
	 * Move a chess piece
	 * @param {Object} params - Parameters for chess piece movement
	 * @returns {Promise} Resolves with move result or rejects with error
	 */
	moveChessPiece(params) {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.connected) {
				reject(new Error('Not connected to server'));
				return;
			}
			
			console.log('Sending chess piece move to server:', params);
			
			// Format the data for the server
			const moveData = {
				pieceId: params.pieceId,
				targetPosition: params.targetPosition
			};
			
			// Send the move request to the server
			this.socket.emit('chess_move', moveData, (response) => {
				if (response && response.success) {
					console.log('Chess move successful:', response);
					resolve(response);
				} else {
					console.error('Chess move failed:', response?.error || 'Unknown error');
					reject(new Error(response?.error || 'Invalid chess move'));
				}
			});
		});
	}
	
	/**
	 * Promote a pawn
	 * @param {Object} params - Promotion parameters
	 * @returns {Promise} Resolves when successful or rejects with error
	 */
	promotePawn(params) {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.connected) {
				reject(new Error('Not connected to server'));
				return;
			}
			
			this.socket.emit('promote_pawn', params, (response) => {
				if (response && response.success) {
					resolve(response);
				} else if (response && response.error) {
					reject(new Error(response.error));
				} else {
					resolve(); // No response means success in current implementation
				}
			});
		});
	}
	
	/**
	 * Skip the chess move phase of a turn (when no valid moves are available)
	 * @returns {Promise} Resolves when successful or rejects with error
	 */
	skipChessMove() {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.connected) {
				reject(new Error('Not connected to server'));
				return;
			}
			
			this.socket.emit('skip_chess_move', (response) => {
				if (response && response.success) {
					resolve(response);
				} else if (response && response.error) {
					reject(new Error(response.error));
				} else {
					resolve(); // No response means success in current implementation
				}
			});
		});
	}
	
	/**
	 * Request first tetromino to start the game
	 * @returns {Promise} Resolves with tetromino data or rejects with error
	 */
	requestTetromino() {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.connected) {
				reject(new Error('Not connected to server'));
				return;
			}
			
			console.log('Requesting first tetromino from server');
			
			this.socket.emit('request_tetromino', (response) => {
				if (response && response.success) {
					console.log('First tetromino received:', response);
					resolve(response);
				} else {
					console.error('Failed to request tetromino:', response?.error || 'Unknown error');
					reject(new Error(response?.error || 'Failed to request tetromino'));
				}
			});
		});
	}
	
	/**
	 * Start a new game or begin an existing game
	 * @param {Object} options - Optional game settings
	 * @returns {Promise} Resolves when game starts successfully
	 */
	startGame(options = {}) {
		return new Promise((resolve, reject) => {
			if (!this.socket || !this.connected) {
				reject(new Error('Not connected to server'));
				return;
			}
			
			console.log('Sending startGame request to server');
			
			this.socket.emit('startGame', options, (response) => {
				if (response && response.success) {
					console.log('Game started successfully:', response);
					resolve(response);
				} else {
					console.error('Failed to start game:', response?.error || 'Unknown error');
					reject(new Error(response?.error || 'Failed to start game'));
				}
			});
		});
	}
	
	/**
	 * Trigger registered callbacks for an event
	 * @private
	 * @param {string} event - Event name
	 * @param {*} data - Event data
	 */
	_triggerCallback(event, data) {
		const callbacks = this.callbacks[event];
		if (callbacks) {
			callbacks.forEach(callback => {
				try {
					callback(data);
				} catch (error) {
					console.error(`Error in ${event} callback:`, error);
				}
			});
		}
	}
}

// Create and export a singleton instance
const gameService = new GameService();
export default gameService; 