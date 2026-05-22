/**
 * PlayerManager.js - Handles player management, registration, and related operations
 */

const World = require('../world/World');
const { PLAYER_SETTINGS } = require('./Constants');
const { log, generateRandomColor, findHomeZonePosition } = require('./GameUtilities');

class PlayerManager {
	constructor(boardManager, chessManager, tetrominoManager) {
		this.boardManager = boardManager;
		this.chessManager = chessManager;
		this.tetrominoManager = tetrominoManager;
	}
	
	/**
	 * Validates and sanitizes a player name
	 * @param {any} playerName - The player name to validate
	 * @param {number} defaultNumber - A number to use in the default name if needed
	 * @returns {string} A valid player name
	 */
	validatePlayerName(playerName, defaultNumber = 1) {
		// Check if name is null/undefined or not a string
		if (!playerName || typeof playerName !== 'string') {
			return `Player ${defaultNumber}`;
		}
		
		// Convert to string if somehow not a string
		let name = String(playerName);
		
		// Trim whitespace
		name = name.trim();
		
		// If empty after trimming, use default
		if (name.length === 0) {
			return `Player ${defaultNumber}`;
		}
		
		// Limit to 32 characters
		if (name.length > 32) {
			name = name.substring(0, 32);
		}
		
		return name;
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
			const existing = game.players[playerId];
			const hasHomeZone = !!(game.homeZones && game.homeZones[playerId]);
			if (existing && hasHomeZone) {
				return {
					success: true,
					player: existing,
					message: 'Player already registered'
				};
			}
			
			// Check if the game has reached its maximum player limit
			const playerCount = Object.values(game.players).filter(p => !p.isObserver).length;
			if (!existing && !isObserver && playerCount >= game.maxPlayers) {
				return {
					success: false,
					error: `Game has reached maximum player limit of ${game.maxPlayers}`
				};
			}
			
			// Validate player name; preserve a previously-chosen name if the
			// caller didn't pass a new one.
			const validatedName = playerName
				? this.validatePlayerName(playerName, playerCount + 1)
				: (existing?.name || this.validatePlayerName(null, playerCount + 1));
			
			// Upsert via World so rich defaults (cooldown timestamps, tetromino
			// bag, AI metadata) survive a registration call.
			const player = World.upsertPlayer(playerId, {
				name: validatedName,
				isObserver,
				color: existing?.color || generateRandomColor(),
				lastMoveTime: existing?.lastMoveTime || 0,
				lastMoveType: existing?.lastMoveType || null,
				isReady: false,
				eliminated: false,
				connected: true,
				joinedAt: existing?.joinedAt || Date.now(),
			});
			
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
				
				log(`Player ${validatedName} (${playerId}) joined the game with home zone at (${homeZone.x}, ${homeZone.z})`);
			} else {
				log(`Observer ${validatedName} (${playerId}) joined the game`);
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
	 * Check whether the player's most recent action was long enough ago that
	 * a new action of `moveType` is allowed under the real-time cooldowns.
	 * Updates `lastMoveTime` / `lastMoveType` on the player record when the
	 * action is permitted.
	 *
	 * Cooldowns are taken from `PLAYER_SETTINGS.*_COOLDOWN_MS` so this stays
	 * in lock-step with the socket-server enforcement in server.js.
	 *
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @param {string} moveType - 'tetromino' | 'chess' | 'purchase'
	 * @returns {boolean} True if the move is permitted.
	 */
	updatePlayerMoveTime(game, playerId, moveType) {
		const player = game.players[playerId];
		if (!player) return false;

		const now = Date.now();
		const cooldown = PlayerManager._cooldownFor(moveType);

		if (player.lastMoveTime > 0 && now - player.lastMoveTime < cooldown) {
			log(`Move rate-limited: ${playerId} attempted ${moveType} after only ${now - player.lastMoveTime}ms (cooldown ${cooldown}ms)`);
			return false;
		}

		player.lastMoveTime = now;
		player.lastMoveType = moveType;
		return true;
	}

	/**
	 * Pick the right cooldown for an action type.
	 * @param {string} moveType
	 * @returns {number} cooldown in milliseconds
	 * @private
	 */
	static _cooldownFor(moveType) {
		switch (moveType) {
			case 'tetromino':
				return PLAYER_SETTINGS.TETROMINO_PLACEMENT_COOLDOWN_MS;
			case 'chess':
			case 'purchase':
				return PLAYER_SETTINGS.CHESS_MOVE_COOLDOWN_MS;
			default:
				return PLAYER_SETTINGS.CHESS_MOVE_COOLDOWN_MS;
		}
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