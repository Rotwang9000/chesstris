/**
 * GameManagerWrapper.js - Bridges between the new modular GameManager and the old socket-based game logic
 * 
 * This wrapper allows for a gradual transition from the old monolithic architecture to
 * the new modular system without disrupting existing functionality.
 */

// Directly require GameManager to avoid circular dependency
const GameManager = require('./GameManager');
const BoardUpdater = require('./BoardUpdater');

class GameManagerWrapper {
	constructor(io) {
		// Initialize the new GameManager
		this.gameManager = new GameManager();
		this.io = io;
		
		// Map to keep track of socket IDs for each player
		this.playerSockets = {};
	}
	
	/**
	 * Create a new game with the given settings
	 * @param {Object} settings - Game settings
	 * @returns {string} The new game ID
	 */
	createGame(settings = {}) {
		const result = this.gameManager.createGame(settings);
		return result.gameId;
	}
	
	/**
	 * Get a game by ID
	 * @param {string} gameId - The game ID
	 * @returns {Object|null} The game object or null if not found
	 */
	getGame(gameId) {
		return this.gameManager.getGame(gameId);
	}
	
	/**
	 * Add a player to a game
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's socket ID
	 * @param {string} playerName - The player's name
	 * @param {Object} socket - The player's socket connection
	 * @returns {Object} Result of the operation
	 */
	addPlayer(gameId, playerId, playerName, socket) {
		// Store the socket for this player
		this.playerSockets[playerId] = socket;
		
		// Register the player with the new GameManager
		const result = this.gameManager.registerPlayer(gameId, playerId, playerName);
		
		if (result.success) {
			// Join the socket room for this game
			socket.join(gameId);
			
			// Get the updated player list for this game
			const game = this.gameManager.getGame(gameId);
			const playerList = Object.keys(game.players).map(id => ({
				id,
				name: game.players[id].name,
				isComputer: id.startsWith('computer-')
			}));
			
			// Notify all players in the game
			this.io.to(gameId).emit('player_joined', {
				playerId,
				playerName,
				gameId,
				players: playerList
			});
			
			// Send game state to the new player
			const gameState = this.gameManager.getGameStateForPlayer(gameId, playerId);
			if (gameState.success) {
				// Process the game state with BoardUpdater to get full state with IDs
				const transformedState = this._transformGameState(gameState.gameState);
				
				// Get board with IDs but don't send incremental changes for the first load
				const { board } = BoardUpdater.getIncrementalChanges(gameId, transformedState.board);
				transformedState.board = board;
				
				// Send to the player
				socket.emit('game_update', transformedState);
			}
		}
		
		return result;
	}
	
	/**
	 * Set a player's ready status
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's ID
	 * @param {boolean} isReady - Ready status
	 * @returns {Object} Result of the operation
	 */
	setPlayerReady(gameId, playerId, isReady) {
		const result = this.gameManager.setPlayerReady(gameId, playerId, isReady);
		
		if (result.success && result.allPlayersReady && result.gameStatus === 'active') {
			// Game has started, notify all players
			this.io.to(gameId).emit('game_started', {
				gameId,
				players: Object.keys(this.gameManager.getGame(gameId).players)
			});
		}
		
		return result;
	}
	
	/**
	 * Add a computer player to a game
	 * @param {string} gameId - The game ID
	 * @param {string} difficulty - Difficulty level
	 * @returns {Object} Result of the operation
	 */
	addComputerPlayer(gameId, difficulty) {
		const result = this.gameManager.addComputerPlayer(gameId, difficulty);
		
		if (result.success) {
			// Notify all players about the new computer player
			const game = this.gameManager.getGame(gameId);
			const playerList = Object.keys(game.players).map(id => ({
				id,
				name: game.players[id].name,
				isComputer: id.startsWith('computer-')
			}));
			
			this.io.to(gameId).emit('player_joined', {
				playerId: result.computerId,
				playerName: result.computerName,
				gameId,
				players: playerList,
				isComputer: true
			});
		}
		
		return result;
	}
	
	/**
	 * Remove a player from a game
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's ID
	 * @returns {Object} Result of the operation
	 */
	removePlayer(gameId, playerId) {
		const result = this.gameManager.removePlayer(gameId, playerId);
		
		if (result.success) {
			// Notify all players about the player leaving
			this.io.to(gameId).emit('player_left', {
				playerId,
				gameId,
				remainingPlayers: result.remainingPlayerCount
			});
			
			// Remove the player's socket from our tracking
			delete this.playerSockets[playerId];
		}
		
		return result;
	}
	
	/**
	 * Handle a tetromino placement action
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's ID
	 * @param {Object} data - Tetromino placement data
	 * @returns {Object} Result of the operation
	 */
	handleTetrominoPlacement(gameId, playerId, data) {
		const action = {
			type: 'tetromino',
			data: {
				pieceType: data.pieceType,
				rotation: data.rotation,
				x: data.x,
				z: data.z,
				y: data.y || 0,
				regenerate: data.regenerate || true
			}
		};
		
		const result = this.gameManager.handlePlayerAction(gameId, playerId, action);
		
		if (result.success) {
			// Get the updated game state
			const gameState = this.gameManager.getGameStateForPlayer(gameId, playerId);
			
			// Broadcast the action to all players in the game except the sender
			const socket = this.playerSockets[playerId];
			if (socket) {
				socket.to(gameId).emit('tetromino_placed', {
					playerId,
					...data,
					result
				});
			}
			
			// Check for completed rows and notify players
			if (result.completedRows > 0) {
				this.io.to(gameId).emit('rows_cleared', {
					playerId,
					completedRows: result.completedRows
				});
			}
		}
		
		return result;
	}
	
	/**
	 * Handle a chess piece movement
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's ID
	 * @param {Object} data - Chess move data
	 * @returns {Object} Result of the operation
	 */
	handleChessMove(gameId, playerId, data) {
		const action = {
			type: 'chess',
			data: {
				pieceId: data.pieceId,
				toX: data.toX,
				toZ: data.toZ
			}
		};
		
		const result = this.gameManager.handlePlayerAction(gameId, playerId, action);
		
		if (result.success) {
			// Get the updated game state
			const gameState = this.gameManager.getGameStateForPlayer(gameId, playerId);
			
			// Broadcast the action to all players in the game except the sender
			const socket = this.playerSockets[playerId];
			if (socket) {
				socket.to(gameId).emit('chess_move', {
					playerId,
					...data,
					result,
					capture: result.capture
				});
			}
			
			// Check if the game is over
			const game = this.gameManager.getGame(gameId);
			if (game.status === 'completed') {
				this._handleGameOver(gameId, game);
			}
		}
		
		return result;
	}
	
	/**
	 * Handle chess piece purchase
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's ID
	 * @param {Object} data - Purchase data
	 * @returns {Object} Result of the operation
	 */
	handlePiecePurchase(gameId, playerId, data) {
		const action = {
			type: 'purchase',
			data: {
				pieceType: data.pieceType,
				x: data.x,
				z: data.z
			}
		};
		
		const result = this.gameManager.handlePlayerAction(gameId, playerId, action);
		
		if (result.success) {
			// Get the updated game state
			const gameState = this.gameManager.getGameStateForPlayer(gameId, playerId);
			
			// Broadcast the action to all players in the game
			this.io.to(gameId).emit('piece_purchased', {
				playerId,
				...data,
				result
			});
		}
		
		return result;
	}
	
	/**
	 * Send the current game state to a player
	 * @param {string} gameId - The game ID
	 * @param {string} playerId - The player's ID
	 */
	sendGameState(gameId, playerId) {
		const result = this.gameManager.getGameStateForPlayer(gameId, playerId);
		
		if (result.success) {
			const socket = this.playerSockets[playerId];
			if (socket) {
				// Process the game state with BoardUpdater to get incremental updates
				const gameState = this._transformGameState(result.gameState);
				
				// Get incremental changes for the board
				const { board, changes, fullUpdate } = BoardUpdater.getIncrementalChanges(gameId, gameState.board);
				
				// Update the game state with the processed board
				gameState.board = board;
				
				// Add changes if this is not a full update
				if (!fullUpdate && changes.length > 0) {
					gameState.boardChanges = changes;
				}
				
				socket.emit('game_update', gameState);
			}
		}
		
		return result;
	}
	
	/**
	 * Handle game over
	 * @param {string} gameId - The game ID
	 * @param {Object} game - The game object
	 * @private
	 */
	_handleGameOver(gameId, game) {
		// Notify all players about the game ending
		this.io.to(gameId).emit('game_over', {
			gameId,
			winnerId: game.winnerId,
			reason: 'king_captured'
		});
	}
	
	/**
	 * Transform the new game state format to the old format for compatibility
	 * @param {Object} gameState - The new format game state
	 * @returns {Object} The transformed game state
	 * @private
	 */
	_transformGameState(gameState) {
		// This method transforms the new GameManager state format
		// to match the format expected by the existing client
		
		// Ensure we have a valid board
		const board = gameState.board || [];
		
		// Calculate the actual board dimensions
		const boardHeight = board.length;
		const boardWidth = boardHeight > 0 ? Math.max(...board.map(row => row ? row.length : 0)) : 0;
		
		const transformed = {
			gameId: gameState.id,
			board: board, // Send the full board without size limitations
			chessPieces: gameState.chessPieces,
			players: Object.entries(gameState.players).map(([id, player]) => ({
				id,
				name: player.name,
				color: player.color,
				isComputer: id.startsWith('computer-'),
				balance: player.balance,
				eliminated: player.eliminated,
				isReady: player.isReady
			})),
			homeZones: Object.entries(gameState.homeZones).map(([id, zone]) => ({
				playerId: id,
				x: zone.x,
				z: zone.z,
				width: zone.width,
				height: zone.height
			})),
			status: gameState.status,
			currentPlayer: gameState.currentPlayer,
			updatedAt: gameState.updatedAt,
			boardSize: Math.max(boardHeight, boardWidth), // Add the actual board size for the client
			boardDimensions: { width: boardWidth, height: boardHeight }, // Add actual dimensions
		};
		
		// Log the size of the board being sent to the client
		console.log(`Sending board to client: ${boardHeight}x${boardWidth}`);
		
		return transformed;
	}
}

module.exports = GameManagerWrapper; 