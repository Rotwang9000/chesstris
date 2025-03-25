/**
 * PlayerManager.js - Handles player management, registration, and related operations
 */

const { PLAYER_SETTINGS } = require('./Constants');
const { log, generateRandomColor, findHomeZonePosition } = require('./GameUtilities');

class PlayerManager {
	constructor(boardManager, chessManager, tetrominoManager) {
		this.boardManager = boardManager;
		this.chessManager = chessManager;
		this.tetrominoManager = tetrominoManager;
	}
	
	/**
	 * Register a new player in the game
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {string} playerName - The player's name
	 * @param {boolean} isObserver - Whether the player is an observer
	 * @returns {Object} Registration result
	 */
	registerPlayer(game, playerId, playerName, isObserver = false) {
		try {
			// Check if the player is already registered
			if (game.players[playerId]) {
				// Player already exists, return the existing player
				return {
					success: true,
					player: game.players[playerId],
					message: 'Player already registered'
				};
			}
			
			// Check if the game has reached its maximum player limit
			const playerCount = Object.values(game.players).filter(p => !p.isObserver).length;
			if (!isObserver && playerCount >= game.maxPlayers) {
				return {
					success: false,
					error: `Game has reached maximum player limit of ${game.maxPlayers}`
				};
			}
			
			// Create a new player
			const player = {
				id: playerId,
				name: playerName || `Player ${playerCount + 1}`,
				isObserver,
				color: generateRandomColor(),
				balance: PLAYER_SETTINGS.INITIAL_BALANCE || 100,
				lastMoveTime: 0,
				lastMoveType: null,
				isReady: false,
				eliminated: false,
				connected: true,
				joinedAt: Date.now()
			};
			
			// Add the player to the game
			game.players[playerId] = player;
			
			// If not an observer, set up home zone and pieces
			if (!isObserver) {
				// Find a position for the home zone
				const homeZone = findHomeZonePosition(game);
				if (!homeZone) {
					return {
						success: false,
						error: 'Could not find a valid position for home zone'
					};
				}
				
				// Set the home zone
				game.homeZones[playerId] = homeZone;
				
				// Initialize chess pieces for the player
				const chessPieces = this.chessManager.initializeChessPieces(game, playerId, homeZone);
				
				// Make sure game.chessPieces is initialized
				if (!Array.isArray(game.chessPieces)) {
					game.chessPieces = [];
					log(`Warning: chessPieces array was not properly initialized for game before adding player ${playerId}`);
				}
				
				// Add chess pieces to the game state and log counts
				if (Array.isArray(chessPieces) && chessPieces.length > 0) {
					game.chessPieces.push(...chessPieces);
					log(`Added ${chessPieces.length} chess pieces for player ${playerId}. Game now has ${game.chessPieces.length} total pieces.`);
				} else {
					log(`Warning: No chess pieces created for player ${playerId}`);
				}
				
				// Generate initial tetrominos for the player
				player.availableTetrominos = this.tetrominoManager.generateTetrominos(game, playerId);
				
				log(`Player ${playerName} (${playerId}) joined the game with home zone at (${homeZone.x}, ${homeZone.z})`);
			} else {
				log(`Observer ${playerName} (${playerId}) joined the game`);
			}
			
			return {
				success: true,
				player,
				homeZone: game.homeZones[playerId],
				newPlayerCount: Object.values(game.players).filter(p => !p.isObserver).length
			};
		} catch (error) {
			log(`Error registering player: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Remove a player from the game
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @returns {Object} Removal result
	 */
	removePlayer(game, playerId) {
		try {
			// Check if the player exists
			if (!game.players[playerId]) {
				return {
					success: false,
					error: 'Player not found'
				};
			}
			
			const player = game.players[playerId];
			
			// Mark the player as disconnected or remove them entirely
			if (player.isObserver) {
				// Observers can be removed entirely
				delete game.players[playerId];
				
				log(`Observer ${player.name} (${playerId}) removed from the game`);
			} else {
				// Active players are just marked as disconnected
				player.connected = false;
				player.disconnectedAt = Date.now();
				
				log(`Player ${player.name} (${playerId}) disconnected from the game`);
				
				// Check if this is the last player
				const connectedPlayers = Object.values(game.players)
					.filter(p => !p.isObserver && p.connected);
				
				if (connectedPlayers.length === 0) {
					// All players have disconnected, consider ending the game
					game.status = 'abandoned';
					game.abandonedAt = Date.now();
					log('Game abandoned - all players disconnected');
				}
			}
			
			return {
				success: true,
				remainingPlayerCount: Object.values(game.players)
					.filter(p => !p.isObserver && p.connected).length
			};
		} catch (error) {
			log(`Error removing player: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Set player readiness status
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {boolean} isReady - Ready status
	 * @returns {Object} Result of the operation
	 */
	setPlayerReady(game, playerId, isReady) {
		try {
			// Check if the player exists
			if (!game.players[playerId]) {
				return {
					success: false,
					error: 'Player not found'
				};
			}
			
			const player = game.players[playerId];
			
			// Update readiness status
			player.isReady = isReady;
			
			log(`Player ${player.name} (${playerId}) is ${isReady ? 'ready' : 'not ready'}`);
			
			// Check if all players are ready
			const allPlayersReady = Object.values(game.players)
				.filter(p => !p.isObserver)
				.every(p => p.isReady);
			
			// Start the game if all players are ready
			if (allPlayersReady && game.status === 'waiting') {
				game.status = 'active';
				game.startedAt = Date.now();
				log('Game started - all players are ready');
			}
			
			return {
				success: true,
				allPlayersReady,
				gameStatus: game.status
			};
		} catch (error) {
			log(`Error setting player readiness: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Update the player's move timestamp
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {string} moveType - The type of move (tetromino, chess, etc.)
	 * @returns {boolean} True if the move is allowed based on timing
	 */
	updatePlayerMoveTime(game, playerId, moveType) {
		// Check if the player exists
		if (!game.players[playerId]) {
			return false;
		}
		
		const player = game.players[playerId];
		const currentTime = Date.now();
		
		// Check minimum move time constraints
		if (player.lastMoveTime > 0) {
			const timeSinceLastMove = currentTime - player.lastMoveTime;
			
			// If the last move was of the same type, apply type-specific minimum time
			if (moveType === player.lastMoveType) {
				const minTime = PLAYER_SETTINGS.MIN_MOVE_TIMES[moveType] || 
					PLAYER_SETTINGS.MIN_MOVE_TIMES.DEFAULT;
				
				if (timeSinceLastMove < minTime) {
					log(`Move rejected: Player ${playerId} attempted ${moveType} move too quickly (${timeSinceLastMove}ms)`);
					return false;
				}
			} else {
				// Different move type, use DEFAULT minimum time
				const minTime = PLAYER_SETTINGS.MIN_MOVE_TIMES.DEFAULT;
				
				if (timeSinceLastMove < minTime) {
					log(`Move rejected: Player ${playerId} attempted move too quickly after different move type (${timeSinceLastMove}ms)`);
					return false;
				}
			}
		}
		
		// Update the last move time and type
		player.lastMoveTime = currentTime;
		player.lastMoveType = moveType;
		
		return true;
	}
	
	/**
	 * Award points to a player
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {number} points - The number of points to award
	 * @param {string} reason - The reason for awarding points
	 * @returns {Object} Updated player balance
	 */
	awardPoints(game, playerId, points, reason) {
		try {
			// Check if the player exists
			if (!game.players[playerId]) {
				return {
					success: false,
					error: 'Player not found'
				};
			}
			
			const player = game.players[playerId];
			
			// Award the points
			player.balance += points;
			
			log(`Awarded ${points} points to player ${player.name} (${playerId}) for: ${reason}`);
			
			return {
				success: true,
				playerId,
				newBalance: player.balance,
				pointsAwarded: points,
				reason
			};
		} catch (error) {
			log(`Error awarding points: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Regenerate tetrominos for a player
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @returns {Object} The new tetrominos
	 */
	regenerateTetrominos(game, playerId) {
		try {
			// Check if the player exists
			if (!game.players[playerId]) {
				return {
					success: false,
					error: 'Player not found'
				};
			}
			
			const player = game.players[playerId];
			
			// Generate new tetrominos
			const tetrominos = this.tetrominoManager.generateTetrominos(game, playerId);
			
			// Update the player's available tetrominos
			player.availableTetrominos = tetrominos;
			
			return {
				success: true,
				tetrominos
			};
		} catch (error) {
			log(`Error regenerating tetrominos: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Handle player actions based on their type
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {Object} action - The action data
	 * @returns {Object} Result of handling the action
	 */
	handlePlayerAction(game, playerId, action) {
		try {
			// Check if the player exists
			if (!game.players[playerId]) {
				return {
					success: false,
					error: 'Player not found'
				};
			}
			
			// Check if the game is active
			if (game.status !== 'active') {
				return {
					success: false,
					error: `Cannot perform actions when game is in ${game.status} state`
				};
			}
			
			// Check if the player is eliminated
			if (game.players[playerId].eliminated) {
				return {
					success: false,
					error: 'Eliminated players cannot perform actions'
				};
			}
			
			// Handle different action types
			switch (action.type) {
				case 'tetromino': {
					// Update move time for tetromino placement
					if (!this.updatePlayerMoveTime(game, playerId, 'tetromino')) {
						return {
							success: false,
							error: 'Move rate limited'
						};
					}
					
					// Process the tetromino placement
					const result = this.tetrominoManager.processTetrominoPiece(
						game, playerId, action.data
					);
					
					// If successful, regenerate tetrominos if needed
					if (result.success && action.data.regenerate) {
						this.regenerateTetrominos(game, playerId);
					}
					
					// Award points for completed rows
					if (result.success && result.completedRows > 0) {
						const points = result.completedRows * PLAYER_SETTINGS.POINTS_PER_ROW;
						this.awardPoints(game, playerId, points, `Cleared ${result.completedRows} rows`);
					}
					
					return result;
				}
				
				case 'chess': {
					// Update move time for chess piece movement
					if (!this.updatePlayerMoveTime(game, playerId, 'chess')) {
						return {
							success: false,
							error: 'Move rate limited'
						};
					}
					
					// Process the chess piece move
					return this.chessManager.processChessMove(game, playerId, action.data);
				}
				
				case 'purchase': {
					// Update move time for piece purchase
					if (!this.updatePlayerMoveTime(game, playerId, 'purchase')) {
						return {
							success: false,
							error: 'Move rate limited'
						};
					}
					
					// Process the piece purchase
					return this.chessManager.processPiecePurchase(game, playerId, action.data);
				}
				
				default:
					return {
						success: false,
						error: `Unknown action type: ${action.type}`
					};
			}
		} catch (error) {
			log(`Error handling player action: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
}

module.exports = PlayerManager; 