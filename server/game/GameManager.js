/**
 * GameManager - Handles core game logic and state on the server side
 * This class is responsible for maintaining game rules and preventing cheating
 */

const crypto = require('crypto');
const constants = require('../constants');
const PLAYER_PAUSE_CHECK_INTERVAL = constants.PLAYER_PAUSE_CHECK_INTERVAL || 60000;

// Import playerPause functions
const playerPause = require('./playerPause');
const {
	handlePlayerPause,
	handlePlayerResume,
	isPlayerPaused,
	getPausedPlayers,
	getPauseTimeRemaining,
	getTimedOutPlayers,
	handlePlayerTimeout
} = playerPause;

class GameManager {
	constructor() {
		// Store all active games
		this.games = new Map();
		
		// Store external computer players
		this.externalComputerPlayers = new Map();
		
		// Store API tokens for external computer players
		this.apiTokens = new Map();
		
		// Constants
		this.MAX_PLAYERS_PER_GAME = 2048;
		this.MIN_HOME_ZONE_DISTANCE = 8;
		this.MAX_HOME_ZONE_DISTANCE = 12;
		this.DEFAULT_GAME_ID = 'default-game';
		this.MIN_MOVE_TIME = 10000; // 10 seconds minimum between moves
		
		// Create a default game automatically
		this._createDefaultGame();
	}
	
	/**
	 * Create the default game
	 * @private
	 */
	_createDefaultGame() {
		// Create the default game with no specific dimensions
		// Board will expand dynamically as players join
		const defaultGame = {
			id: this.DEFAULT_GAME_ID,
			players: {},
			board: this._createEmptyBoard(30, 30), // Start with a minimal board
			settings: {
				minHomeZoneDistance: this.MIN_HOME_ZONE_DISTANCE,
				maxHomeZoneDistance: this.MAX_HOME_ZONE_DISTANCE,
				expandBoardAsNeeded: true,
				cellSize: 1
			},
			startTime: Date.now(),
			lastUpdate: Date.now()
		};
		
		this.games.set(this.DEFAULT_GAME_ID, defaultGame);
	}
	
	/**
	 * Create a new game
	 * @param {Object} options - Game options
	 * @returns {Object} Game creation result with gameId
	 */
	createGame(options = {}) {
		try {
			// Generate a unique game ID
			const gameId = options.gameId || this._generateGameId();
			
			// Check if the game already exists
			if (this.games.has(gameId)) {
				return { 
					success: false, 
					error: 'Game with this ID already exists' 
				};
			}
			
			// Set default minimum and maximum home zone distances
			const minHomeZoneDistance = options.minHomeZoneDistance || this.MIN_HOME_ZONE_DISTANCE;
			const maxHomeZoneDistance = options.maxHomeZoneDistance || this.MAX_HOME_ZONE_DISTANCE;
			
			// Create a new game
			const game = {
				id: gameId,
				players: {},
				// Use specified dimensions or start with a minimal board that will expand
				board: this._createEmptyBoard(
					options.width || 30, 
					options.height || 30
				),
				settings: {
					minHomeZoneDistance,
					maxHomeZoneDistance,
					expandBoardAsNeeded: options.expandBoardAsNeeded !== false,
					cellSize: options.cellSize || 1,
					homeZoneDegradationInterval: options.homeZoneDegradationInterval || 300000, // 5 minutes default
					enableHomeZoneDegradation: options.enableHomeZoneDegradation !== false // Enabled by default
				},
				startTime: Date.now(),
				lastUpdate: Date.now()
			};
			
			// Store the game
			this.games.set(gameId, game);
			
			// Start home zone degradation timer if enabled
			if (game.settings.enableHomeZoneDegradation) {
				this.startHomeZoneDegradationTimer(gameId);
			}
			
			return { 
				success: true, 
				gameId 
			};
		} catch (error) {
			console.error('Error creating game:', error);
			return { 
				success: false, 
				error: error.message 
			};
		}
	}
	
	/**
	 * Add a player to a game
	 * @param {string} gameId - Game ID
	 * @param {string} playerId - Player ID
	 * @param {string} username - Player username
	 * @returns {Object} Result of the operation
	 */
	addPlayer(gameId, playerId, username = 'Anonymous') {
		try {
			// Get the game state
			const game = this.games.get(gameId);
			if (!game) {
				return {
					success: false,
					error: `Game ${gameId} not found`
				};
			}
			
			// Check if player already exists in the game
			if (game.players[playerId]) {
				// Update player data
				game.players[playerId].active = true;
				game.players[playerId].lastSeen = Date.now();
				
				return {
					success: true,
					message: `Player ${playerId} reconnected to game ${gameId}`
				};
			}
			
			// Check if the game is full
			const playerCount = Object.keys(game.players).length;
			if (playerCount >= game.settings.maxPlayers) {
				return {
					success: false,
					error: `Game ${gameId} is full (${playerCount}/${game.settings.maxPlayers} players)`
				};
			}
			
			// Generate a random color for the player
			const color = this._generateRandomColor();
			
			// Find a suitable home zone position
			const homeZone = this._findHomeZonePosition(game);
			
			// Add the player to the game
			game.players[playerId] = {
				id: playerId,
				username: username,
				color: color,
				homeZone: homeZone,
				active: true,
				joinedAt: Date.now(),
				lastSeen: Date.now(),
				lastMoveTime: Date.now(),
				minMoveInterval: 10000, // 10 seconds minimum between moves
				currentMoveType: 'tetromino', // Start with tetromino placement
				score: 0,
				pieces: [] // Will be populated by _createHomeZoneForPlayer
			};
			
			// Create the player's home zone and chess pieces
			this._createHomeZoneForPlayer(game, playerId);
			
			// Initialize available tetrominos for the player
			if (!game.availableTetrominos) {
				game.availableTetrominos = {};
			}
			
			game.availableTetrominos[playerId] = this._generateTetrominos(game, playerId);
			
			// Update game status if needed
			if (game.status === 'waiting' && playerCount >= 1) {
				game.status = 'active';
			}
			
			// Log the player addition
			console.log(`Player ${username} (${playerId}) added to game ${gameId}`);
			console.log(`Game now has ${Object.keys(game.players).length} players`);
			
			return {
				success: true,
				message: `Player ${playerId} added to game ${gameId}`
			};
		} catch (error) {
			console.error('Error adding player:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Expand the game board in all directions
	 * @param {Object} game - The game object
	 * @param {number} addWidth - Additional width to add (half on each side)
	 * @param {number} addHeight - Additional height to add (half on each side)
	 * @private
	 */
	_expandBoard(game, addWidth, addHeight) {
		const oldWidth = game.board[0].length;
		const oldHeight = game.board.length;
		
		const newWidth = oldWidth + addWidth;
		const newHeight = oldHeight + addHeight;
		
		// Create a new, larger board
		const newBoard = this._createEmptyBoard(newWidth, newHeight);
		
		// Calculate offsets to center the old board in the new one
		const xOffset = Math.floor(addWidth / 2);
		const yOffset = Math.floor(addHeight / 2);
		
		// Copy the old board content to the new board
		for (let y = 0; y < oldHeight; y++) {
			for (let x = 0; x < oldWidth; x++) {
				if (game.board[y][x]) {
					newBoard[y + yOffset][x + xOffset] = game.board[y][x];
					
					// Update piece positions if there are any
					if (game.board[y][x].chessPiece) {
						game.board[y][x].chessPiece.x = x + xOffset;
						game.board[y][x].chessPiece.y = y + yOffset;
					}
				}
			}
		}
		
		// Update home zone positions for all players
		for (const playerId in game.players) {
			const player = game.players[playerId];
			player.homeZone.x += xOffset;
			player.homeZone.y += yOffset;
		}
		
		// Replace the old board with the new one
		game.board = newBoard;
		
		console.log(`Expanded board from ${oldWidth}x${oldHeight} to ${newWidth}x${newHeight}`);
	}
	
	/**
	 * Move a chess piece
	 * @param {string} gameId - Game ID
	 * @param {string} playerId - Player making the move
	 * @param {Object} moveData - Move data (piece ID, from/to coordinates)
	 * @returns {Object} Result of the move
	 */
	moveChessPiece(gameId, playerId, moveData) {
		try {
			// Get the game state
			const game = this.games.get(gameId);
			if (!game) {
				return {
					success: false,
					error: `Game ${gameId} not found`
				};
			}
			
			// Check if player exists in the game
			if (!game.players[playerId]) {
				return {
					success: false,
					error: `Player ${playerId} not found in game ${gameId}`
				};
			}
			
			// Check minimum move time
			const timeSinceLastMove = Date.now() - (game.players[playerId].lastMoveTime || 0);
			const minMoveInterval = game.players[playerId].minMoveInterval || 10000; // Default 10 seconds
			
			if (timeSinceLastMove < minMoveInterval) {
				return {
					success: false,
					error: `Must wait ${(minMoveInterval - timeSinceLastMove) / 1000} more seconds`,
					waitTime: minMoveInterval - timeSinceLastMove
				};
			}
			
			// Handle skip move request
			if (moveData.skipMove) {
				console.log(`Player ${playerId} is skipping chess move`);
				
				// Check if the player has any valid chess moves
				const hasValidMoves = this.hasValidChessMoves(gameId, playerId);
				if (!hasValidMoves) {
					// Update the player's move type to tetromino
					game.players[playerId].currentMoveType = 'tetromino';
					game.currentMoveType = 'tetromino';
					
					return {
						success: true,
						message: 'Chess move skipped, no valid moves available',
						skipToTetromino: true
					};
				} else {
					return {
						success: false,
						error: 'Cannot skip chess move, valid moves are available'
					};
				}
			}
			
			// Extract move data
			const { pieceId, position } = moveData;
			let fromX, fromY, toX, toY;
			
			// Handle different move data formats
			if (position) {
				fromX = position.fromX;
				fromY = position.fromY;
				toX = position.toX;
				toY = position.toY;
			} else {
				fromX = moveData.fromX;
				fromY = moveData.fromY;
				toX = moveData.toX;
				toY = moveData.toY;
			}
			
			// Validate that coordinates are numbers
			if (typeof fromX !== 'number' || typeof fromY !== 'number' || 
				typeof toX !== 'number' || typeof toY !== 'number') {
				return {
					success: false,
					error: 'Invalid coordinates: must be numbers'
				};
			}
			
			// Check if destination is within board bounds
			const boardSize = game.settings.boardSize;
			if (toX < 0 || toX >= boardSize || toY < 0 || toY >= boardSize) {
				return {
					success: false,
					error: `Destination is not on the board`
				};
			}
			
			// Find the piece
			let piece = null;
			let pieceX = fromX;
			let pieceY = fromY;
			
			// First check the chessPieces array
			if (game.chessPieces && Array.isArray(game.chessPieces)) {
				const pieceIndex = game.chessPieces.findIndex(p => 
					p && p.id === pieceId && p.player === playerId && 
					p.position && p.position.x === fromX && p.position.y === fromY
				);
				
				if (pieceIndex !== -1) {
					piece = game.chessPieces[pieceIndex];
				}
			}
			
			// If not found in chessPieces, check the board
			if (!piece) {
				// Find the piece on the board
				const fromCell = game.board[fromY][fromX];
				if (!fromCell || !fromCell.chessPiece || fromCell.chessPiece.id !== pieceId || fromCell.chessPiece.player !== playerId) {
					return {
						success: false,
						error: `Chess piece ${pieceId} not found at position (${fromX}, ${fromY})`
					};
				}
				
				piece = fromCell.chessPiece;
			}
			
			// Validate the move
			if (!this._isValidChessMove(game, piece, fromX, fromY, toX, toY)) {
				return {
					success: false,
					error: `Invalid chess move for ${piece.type} from (${fromX}, ${fromY}) to (${toX}, ${toY})`
				};
			}
			
			// Check for capture
			let capturedPiece = null;
			const toCell = game.board[toY][toX];
			
			if (toCell && toCell.chessPiece && toCell.chessPiece.player !== playerId) {
				capturedPiece = toCell.chessPiece;
				
				// Remove captured piece from chessPieces array
				if (game.chessPieces && Array.isArray(game.chessPieces)) {
					const capturedIndex = game.chessPieces.findIndex(p => 
						p && p.id === capturedPiece.id && p.player === capturedPiece.player
					);
					
					if (capturedIndex !== -1) {
						game.chessPieces.splice(capturedIndex, 1);
					}
				}
			}
			
			// Track movement for pawn
			let pawnPromoted = false;
			if (piece.type === 'pawn') {
				// Initialize moveDistance if it doesn't exist
				if (!piece.moveDistance) piece.moveDistance = 0;
				
				// Determine the forward direction based on home zone orientation
				const player = game.players[playerId];
				let forwardDirection;
				
				if (!player.homeZone) {
					// Default to 'up' if homeZone isn't defined
					forwardDirection = 'up';
				} else {
					// Determine direction based on home zone position
					const homeX = player.homeZone.x;
					const homeY = player.homeZone.y;
					const boardCenterX = boardSize / 2;
					const boardCenterY = boardSize / 2;
					
					// Determine primary direction based on relative position to board center
					if (Math.abs(homeX - boardCenterX) > Math.abs(homeY - boardCenterY)) {
						// Home zone is more to the left/right of center
						forwardDirection = homeX < boardCenterX ? 'right' : 'left';
					} else {
						// Home zone is more to the top/bottom of center
						forwardDirection = homeY < boardCenterY ? 'down' : 'up';
					}
				}
				
				// Count forward movement based on determined direction
				const distanceX = Math.abs(toX - fromX);
				const distanceY = Math.abs(toY - fromY);
				
				if ((forwardDirection === 'up' && toY < fromY) || 
					(forwardDirection === 'down' && toY > fromY) ||
					(forwardDirection === 'left' && toX < fromX) ||
					(forwardDirection === 'right' && toX > fromX)) {
					// Add the movement distance
					piece.moveDistance += (distanceX || distanceY);
				}
				
				// Check for promotion (8 spaces forward)
				if (piece.moveDistance >= 8) {
					piece.type = 'knight';
					pawnPromoted = true;
					this.log(`Pawn promoted to knight at (${toX}, ${toY})`);
				}
			}
			
			// Update the piece position
			piece.position = { x: toX, y: toY };
			piece.moveCount = (piece.moveCount || 0) + 1;
			
			// Update the board
			if (game.board[fromY][fromX] && game.board[fromY][fromX].chessPiece) {
				game.board[fromY][fromX].chessPiece = null;
			}
			
			if (!game.board[toY][toX]) {
				game.board[toY][toX] = {};
			}
			
			game.board[toY][toX].chessPiece = piece;
			
			// Update the last move time
			game.players[playerId].lastMoveTime = Date.now();
			
			// Check for pawn promotion
			if (pawnPromoted) {
				const oldType = piece.type;
				piece.type = 'knight';
				piece.promoted = true;
				
				// Emit pawn promotion event
				this.emitGameEvent(gameId, 'pawnPromoted', {
					playerId,
					pieceId: piece.id,
					x: toX,
					y: toY,
					oldType,
					newType: 'knight'
				});
				
				console.log(`Pawn promoted to knight at (${toX}, ${toY})`);
			}
			
			// Handle king capture
			if (capturedPiece && capturedPiece.type === 'king') {
				this._handleKingCapture(game, capturedPiece.player, playerId);
			}
			
			// Update the player's move type to tetromino for next turn
			game.players[playerId].currentMoveType = 'tetromino';
			
			// Update the last updated timestamp
			game.lastUpdate = Date.now();
			
			return {
				success: true,
				capturedPiece: capturedPiece ? {
					id: capturedPiece.id,
					type: capturedPiece.type,
					player: capturedPiece.player
				} : null,
				pawnPromoted: pawnPromoted
			};
		} catch (error) {
			console.error('Error moving chess piece:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Check if a player has any valid chess moves
	 * @param {string} gameId - Game ID
	 * @param {string} playerId - Player ID
	 * @returns {boolean} True if the player has valid chess moves
	 */
	hasValidChessMoves(gameId, playerId) {
		try {
			// Get the game state
			const game = this.games.get(gameId);
			if (!game) {
				return false;
			}
			
			// Check if player exists in the game
			if (!game.players[playerId]) {
				return false;
			}
			
			// Get all chess pieces belonging to the player
			const playerPieces = [];
			
			// First check the chessPieces array (primary source)
			if (game.chessPieces && Array.isArray(game.chessPieces)) {
				for (const piece of game.chessPieces) {
					if (piece && piece.player === playerId && piece.position) {
						playerPieces.push({
							piece: piece,
							x: piece.position.x,
							y: piece.position.y
						});
					}
				}
			}
			
			// If no pieces found in chessPieces array, check the board as fallback
			if (playerPieces.length === 0) {
				for (let y = 0; y < game.board.length; y++) {
					for (let x = 0; x < game.board[y].length; x++) {
						const cell = game.board[y][x];
						if (cell && cell.chessPiece && cell.chessPiece.player === playerId) {
							playerPieces.push({
								piece: cell.chessPiece,
								x,
								y
							});
						}
					}
				}
			}
			
			console.log(`Found ${playerPieces.length} chess pieces for player ${playerId}`);
			
			// Check if any piece has a valid move
			for (const { piece, x, y } of playerPieces) {
				// Check all possible directions
				const directions = [
					{ dx: 1, dy: 0 },
					{ dx: -1, dy: 0 },
					{ dx: 0, dy: 1 },
					{ dx: 0, dy: -1 },
					{ dx: 1, dy: 1 },
					{ dx: 1, dy: -1 },
					{ dx: -1, dy: 1 },
					{ dx: -1, dy: -1 }
				];
				
				for (const { dx, dy } of directions) {
					const toX = x + dx;
					const toY = y + dy;
					
					// Check if the move is valid
					try {
						this._validateCoordinates(game, toX, toY);
						
						// Check if the destination is valid for the piece type
						if (this._isValidChessMove(game, piece, x, y, toX, toY)) {
							// Check if there's a piece at the destination
							const toCell = game.board[toY][toX];
							if (!toCell || !toCell.chessPiece || toCell.chessPiece.player !== playerId) {
								// Valid move found
								console.log(`Valid chess move found for ${piece.type} at (${x}, ${y}) to (${toX}, ${toY})`);
								return true;
							}
						}
					} catch (error) {
						// Invalid coordinates, continue checking other directions
						continue;
					}
				}
			}
			
			// No valid moves found
			console.log(`No valid chess moves found for player ${playerId}`);
			return false;
		} catch (error) {
			console.error('Error checking for valid chess moves:', error);
			return false;
		}
	}
	
	/**
	 * Place a tetris piece on the board
	 * @param {string} gameId - The ID of the game
	 * @param {string} playerId - The ID of the player
	 * @param {Object} moveData - Data about the move
	 * @returns {Object} Result of the move
	 */
	placeTetrisPiece(gameId, playerId, moveData) {
		try {
			// Get the game state
			const game = this.games.get(gameId);
			if (!game) {
				return {
					success: false,
					error: `Game ${gameId} not found`
				};
			}
			
			// Check if player exists in the game
			if (!game.players[playerId]) {
				return {
					success: false,
					error: `Player ${playerId} not found in game ${gameId}`
				};
			}
			
			// In asynchronous turns, we don't check if it's the player's turn
			// We only check if the move type is valid
			if (game.players[playerId].currentMoveType !== 'tetromino') {
				return {
					success: false,
					error: `Expected tetromino move, got ${game.players[playerId].currentMoveType}`
				};
			}
			
			// Validate the tetris piece placement
			const { pieceType, rotation, x, z, y = 0 } = moveData;
			
			// Check if the piece type is valid
			if (!this._isValidTetrisPiece(pieceType)) {
				return {
					success: false,
					error: `Invalid tetris piece type: ${pieceType}`
				};
			}
			
			// Get the tetris piece shape based on type and rotation
			const pieceShape = this._getTetrisPieceShape(pieceType, rotation);
			
			// Check minimum move time
			const timeSinceLastMove = Date.now() - (game.players[playerId].lastMoveTime || 0);
			const minMoveInterval = game.players[playerId].minMoveInterval || 10000; // Default 10 seconds
			
			if (timeSinceLastMove < minMoveInterval) {
				return {
					success: false,
					error: `Must wait ${(minMoveInterval - timeSinceLastMove) / 1000} more seconds`,
					waitTime: minMoveInterval - timeSinceLastMove
				};
			}
			
			// Check if the piece can be placed at the specified position with Y-axis logic
			if (!this._canPlaceTetromino(game, pieceShape, x, z, y, playerId)) {
				// If at Y=1 and the tetromino can't be placed, it explodes to nothing
				if (y === 1) {
					// No actual placement occurs - tetromino explodes
					// We still consider this a successful move as it's a valid game action
					
					// Update the last move time
					game.players[playerId].lastMoveTime = Date.now();
					
					// If player has no valid chess moves, keep move type as tetromino
					if (this.hasValidChessMoves(gameId, playerId)) {
						game.players[playerId].currentMoveType = 'chess';
					} else {
						game.players[playerId].currentMoveType = 'tetromino';
					}
					
					return {
						success: true,
						message: 'Tetromino exploded at Y=1',
						exploded: true
					};
				}
				
				// If at Y=0 and has no valid connection, it can't be placed
				return {
					success: false,
					error: `Cannot place tetris piece at position (${x}, ${z}, ${y})`
				};
			}
			
			// Place the tetris piece at Y=0 (only possible placement)
			this._placeTetromino(game, pieceShape, x, z, playerId);
			
			// Store the placement position for future movement limit checks
			game.players[playerId].lastTetrominoPlacement = { x, z };
			
			// Update the last move time
			game.players[playerId].lastMoveTime = Date.now();
			
			// Check for completed rows
			const completedRows = this._checkAndClearRows(game);
			
			// Update the player's move type for next turn
			// Check if the player has any valid chess moves
			if (this.hasValidChessMoves(gameId, playerId)) {
				game.players[playerId].currentMoveType = 'chess';
			} else {
				// If no valid chess moves, keep the move type as tetromino
				game.players[playerId].currentMoveType = 'tetromino';
			}
			
			// Update the last updated timestamp
			game.lastUpdate = Date.now();
			
			return {
				success: true,
				completedRows: completedRows.length
			};
		} catch (error) {
			console.error('Error placing tetris piece:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Get the current state of a game
	 * @param {string} gameId - The ID of the game
	 * @returns {Object|null} The game state or null if not found
	 */
	getGameState(gameId) {
		// For testing environments, check if we're using a mock games Map
		if (this.games) {
			const game = this.games.get(gameId);
			if (!game) {
				this.log(`Game ${gameId} not found`);
				return null;
			}
			return game;
		}

		// If we're not using a direct games map, try to get the game from storage
		try {
			return this.gameStateService.getGameState(gameId);
		} catch (error) {
			this.log(`Error retrieving game ${gameId}: ${error.message}`);
			return null;
		}
	}
	
	/**
	 * Generate a unique game ID
	 * @returns {string} A unique game ID
	 * @private
	 */
	_generateGameId() {
		// Simple implementation - in production use UUID or similar
		return 'game_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
	}
	
	/**
	 * Create an empty game board
	 * @param {number} width - Board width (X-axis)
	 * @param {number} height - Board height (Y-axis)
	 * @returns {Array} 2D array representing the empty board
	 * @private
	 */
	_createEmptyBoard(width, height) {
		const board = [];
		for (let y = 0; y < height; y++) {
			board[y] = [];
			for (let x = 0; x < width; x++) {
				board[y][x] = null;
			}
		}
		return board;
	}
	
	/**
	 * Create an empty game board
	 * @param {number} width - Board width (X-axis)
	 * @param {number} depth - Board depth (Z-axis)
	 * @returns {Array} 2D array representing the empty board on the XZ plane
	 * @private
	 */
	_createEmptyBoard(width, depth) {
		const board = [];
		for (let z = 0; z < depth; z++) {
			board[z] = [];
			for (let x = 0; x < width; x++) {
				board[z][x] = null;
			}
		}
		return board;
	}
	
	/**
	 * Generate a random color for a player
	 * @returns {string} Hex color code
	 * @private
	 */
	_generateRandomColor() {
		// Define a set of vibrant, visually distinguishable colors
		const predefinedColors = [
			'#FF5733', // Coral red
			'#33FF57', // Bright green
			'#3357FF', // Royal blue
			'#FF33F5', // Pink
			'#F5FF33', // Yellow
			'#33FFF5', // Cyan
			'#FF8333', // Orange
			'#8333FF', // Purple
			'#33FF83', // Seafoam green
			'#FF3383'  // Rose
		];
		
		// Pick a random color from the list
		const randomIndex = Math.floor(Math.random() * predefinedColors.length);
		return predefinedColors[randomIndex];
	}
	
	/**
	 * Find a suitable position for a player's home zone
	 * @param {Object} game - The game object
	 * @returns {Object} Home zone position {x, y}
	 * @private
	 */
	_findHomeZonePosition(game) {
		// Define home zone dimensions
		const homeZoneWidth = 8;  // Standard chess board width
		const homeZoneHeight = 2; // Two rows for pieces
		
		// Get the current board dimensions
		const boardWidth = game.board[0].length;
		const boardHeight = game.board.length;
		
		// Define possible starting positions
		const possiblePositions = [
			{ x: 0, y: 0 },                                  // Top-left
			{ x: boardWidth - homeZoneWidth, y: 0 },         // Top-right
			{ x: 0, y: boardHeight - homeZoneHeight },       // Bottom-left
			{ x: boardWidth - homeZoneWidth, y: boardHeight - homeZoneHeight } // Bottom-right
		];
		
		// Add center positions
		const centerX = Math.floor((boardWidth - homeZoneWidth) / 2);
		const centerY = Math.floor((boardHeight - homeZoneHeight) / 2);
		
		possiblePositions.push(
			{ x: centerX, y: 0 },                            // Top-center
			{ x: centerX, y: boardHeight - homeZoneHeight }, // Bottom-center
			{ x: 0, y: centerY },                            // Left-center
			{ x: boardWidth - homeZoneWidth, y: centerY }    // Right-center
		);
		
		// Shuffle the positions to add randomness
		this._shuffleArray(possiblePositions);
		
		// Check each position for suitability
		for (const position of possiblePositions) {
			// Check if the position is valid
			if (this._isValidHomeZonePosition(game, position.x, position.y, homeZoneWidth, homeZoneHeight)) {
				console.log(`Found valid home zone position at (${position.x}, ${position.y})`);
				return position;
			}
		}
		
		// If no suitable position found, expand the board and try again
		console.log('No suitable home zone position found. Expanding the board...');
		this._expandBoard(game, homeZoneWidth * 2, homeZoneHeight * 2);
		
		// Try again with the expanded board
		return this._findHomeZonePosition(game);
	}
	
	/**
	 * Check if a position is valid for a home zone
	 * @param {Object} game - The game object
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @param {number} width - Home zone width
	 * @param {number} height - Home zone height
	 * @returns {boolean} True if the position is valid
	 * @private
	 */
	_isValidHomeZonePosition(game, x, y, width, height) {
		// Check if the position is within the board
		if (x < 0 || y < 0 || x + width > game.board[0].length || y + height > game.board.length) {
			return false;
		}
		
		// Check if the area is free (no other home zones or pieces)
		for (let dy = 0; dy < height; dy++) {
			for (let dx = 0; dx < width; dx++) {
				const cell = game.board[y + dy][x + dx];
				if (cell && (cell.type === 'HOME_ZONE' || cell.chessPiece)) {
					return false;
				}
			}
		}
		
		// Check if the position is far enough from other home zones
		for (const playerId in game.players) {
			const player = game.players[playerId];
			if (player.homeZone) {
				const distance = Math.sqrt(
					Math.pow(player.homeZone.x - x, 2) + 
					Math.pow(player.homeZone.y - y, 2)
				);
				
				if (distance < game.settings.minHomeZoneDistance) {
					return false;
				}
			}
		}
		
		return true;
	}
	
	/**
	 * Shuffle an array in place
	 * @param {Array} array - The array to shuffle
	 * @private
	 */
	_shuffleArray(array) {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
	}
	
	/**
	 * Create home zone and chess pieces for a player
	 * @param {Object} game - The game object
	 * @param {string} playerId - The player's ID
	 * @private
	 */
	_createHomeZoneForPlayer(game, playerId) {
		try {
			// Get the player
			const player = game.players[playerId];
			
			if (!player || !player.homeZone) {
				console.error('Invalid player or home zone data:', player);
				return;
			}
			
			// Extract home zone position
			const { x: startX, y: startY } = player.homeZone;
			
			// Set home zone dimensions
			const homeZoneWidth = 8;  // Standard chess board width
			const homeZoneHeight = 2; // Two rows for pieces
			
			console.log(`Creating home zone for player ${playerId} at (${startX}, ${startY}) with dimensions ${homeZoneWidth}x${homeZoneHeight}`);
			
			// Create home zone cells
			for (let y = startY; y < startY + homeZoneHeight; y++) {
				for (let x = startX; x < startX + homeZoneWidth; x++) {
					// Ensure the board is big enough
					if (y >= game.board.length || x >= game.board[0].length) {
						this._expandBoard(game, 
							x >= game.board[0].length ? (x - game.board[0].length + 10) : 0,
							y >= game.board.length ? (y - game.board.length + 10) : 0
						);
					}
					
					// Create a home zone cell
					game.board[y][x] = {
						type: 'HOME_ZONE',
						playerId,
						color: player.color,
						created: Date.now()
					};
				}
			}
			
			// Initialize chessPieces array if it doesn't exist
			if (!game.chessPieces) {
				game.chessPieces = [];
			}
			
			// Add chess pieces
			const pieces = [];
			
			// Standard chess layout:
			// Front row (y=1): Pawns
			// Back row (y=0): Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook
			
			// Add pawns (front row)
			for (let x = 0; x < homeZoneWidth; x++) {
				const pawn = {
					id: `${playerId}-pawn-${x}`,
					type: 'pawn',
					player: playerId,
					position: {
						x: startX + x,
						y: startY
					},
					moveCount: 0
				};
				
				pieces.push(pawn);
				
				// Add pawn to the board
				if (game.board[startY] && game.board[startY][startX + x]) {
					game.board[startY][startX + x].chessPiece = pawn;
				}
			}
			
			// Add other pieces (back row)
			const backRow = [
				{ type: 'rook', id: `${playerId}-rook-1` },
				{ type: 'knight', id: `${playerId}-knight-1` },
				{ type: 'bishop', id: `${playerId}-bishop-1` },
				{ type: 'queen', id: `${playerId}-queen` },
				{ type: 'king', id: `${playerId}-king` },
				{ type: 'bishop', id: `${playerId}-bishop-2` },
				{ type: 'knight', id: `${playerId}-knight-2` },
				{ type: 'rook', id: `${playerId}-rook-2` }
			];
			
			for (let x = 0; x < backRow.length; x++) {
				const piece = {
					...backRow[x],
					player: playerId,
					position: {
						x: startX + x,
						y: startY + 1
					},
					moveCount: 0
				};
				
				pieces.push(piece);
				
				// Add piece to the board
				if (game.board[startY + 1] && game.board[startY + 1][startX + x]) {
					game.board[startY + 1][startX + x].chessPiece = piece;
				}
			}
			
			// Store the pieces in the player object
			player.pieces = pieces;
			
			// Add pieces to the game's chessPieces array for easier access
			game.chessPieces.push(...pieces);
			
			console.log(`Created home zone for player ${playerId} at (${startX}, ${startY}) with ${pieces.length} pieces`);
			
			// Log the pieces for debugging
			pieces.forEach(piece => {
				console.log(`  - ${piece.type} at (${piece.position.x}, ${piece.position.y})`);
			});
			
			// Ensure all pieces have valid positions
			const invalidPieces = pieces.filter(piece => !piece.position || piece.position.x === undefined || piece.position.y === undefined);
			if (invalidPieces.length > 0) {
				console.error(`WARNING: ${invalidPieces.length} pieces have invalid positions:`);
				invalidPieces.forEach(piece => {
					console.error(`  - ${piece.type} has invalid position:`, piece.position);
				});
			}
			
			return pieces;
		} catch (error) {
			console.error('Error creating home zone:', error);
			return [];
		}
	}
	
	/**
	 * Validate board coordinates
	 * @param {Object} game - The game state
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @throws {Error} If coordinates are invalid
	 * @private
	 */
	_validateCoordinates(game, x, y) {
		const boardSize = game.settings.boardSize;
		
		if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
			throw new Error(`Coordinates (${x}, ${y}) are outside the board bounds`);
		}
	}
	
	/**
	 * Validates if a chess piece can move from a starting position to a destination
	 * @param {Object} game - The game state
	 * @param {Object} piece - The chess piece to move
	 * @param {number} startX - Starting X coordinate
	 * @param {number} startY - Starting Y coordinate
	 * @param {number} destX - Destination X coordinate
	 * @param {number} destY - Destination Y coordinate
	 * @returns {boolean} - Whether the move is valid
	 */
	_isValidChessMove(game, piece, startX, startY, destX, destY) {
		// Check if destination is within board bounds
		if (destX < 0 || destX >= game.settings.boardSize || 
			destY < 0 || destY >= game.settings.boardSize) {
			return false;
		}
		
		// Check if destination has one of the player's own pieces
		if (game.board[destY][destX]?.chessPiece?.player === piece.player) {
			return false;
		}
		
		// Calculate the distance and direction
		const dx = destX - startX;
		const dy = destY - startY;
		const absX = Math.abs(dx);
		const absY = Math.abs(dy);
		
		// Different movement patterns based on piece type
		switch (piece.type) {
			case 'king':
				// Kings can move one square in any direction
				return absX <= 1 && absY <= 1;
				
			case 'queen':
				// Queens can move any number of squares horizontally, vertically, or diagonally
				// Check if the move is horizontal, vertical, or diagonal
				if (!(dx === 0 || dy === 0 || absX === absY)) {
					return false;
				}
				// Check for obstacles in the path
				return this._isPathClear(game, startX, startY, destX, destY);
				
			case 'rook':
				// Rooks can move any number of squares horizontally or vertically
				// Check if the move is horizontal or vertical
				if (!(dx === 0 || dy === 0)) {
					return false;
				}
				// Check for obstacles in the path
				return this._isPathClear(game, startX, startY, destX, destY);
				
			case 'bishop':
				// Bishops can move any number of squares diagonally
				// Check if the move is diagonal
				if (absX !== absY) {
					return false;
				}
				// Check for obstacles in the path
				return this._isPathClear(game, startX, startY, destX, destY);
				
			case 'knight':
				// Knights move in an L-shape (2 squares in one direction, then 1 square perpendicular)
				return (absX === 2 && absY === 1) || (absX === 1 && absY === 2);
				
			case 'pawn':
				// In this game, pawns can move one square in any direction
				return absX <= 1 && absY <= 1;
				
			default:
				return false;
		}
	}
	
	/**
	 * Checks if the path between two positions is clear of obstacles
	 * @param {Object} game - The game state
	 * @param {number} startX - Starting X coordinate
	 * @param {number} startY - Starting Y coordinate
	 * @param {number} destX - Destination X coordinate
	 * @param {number} destY - Destination Y coordinate
	 * @returns {boolean} - Whether the path is clear
	 */
	_isPathClear(game, startX, startY, destX, destY) {
		// Calculate the direction of movement
		const dx = Math.sign(destX - startX);
		const dy = Math.sign(destY - startY);
		
		// Start from the square after the starting position
		let x = startX + dx;
		let y = startY + dy;
		
		// Check each square in the path except the destination
		while ((x !== destX || y !== destY) && 
		       x >= 0 && x < game.settings.boardSize && 
		       y >= 0 && y < game.settings.boardSize) {
			
			if (game.board[y][x]?.chessPiece) {
				return false; // Path is blocked
			}
			
			x += dx;
			y += dy;
		}
		
		// Make sure we stopped because we reached the destination, not because we went out of bounds
		return x === destX && y === destY;
	}
	
	/**
	 * Handle a king capture event
	 * @param {Object} game - The game state
	 * @param {string} captorId - ID of the player who captured the king
	 * @param {string} capturedId - ID of the player whose king was captured
	 * @private
	 */
	_handleKingCapture(game, captorId, capturedId) {
		this.log(`Player ${captorId} captured ${capturedId}'s king!`);
		
		// Transfer ownership of remaining pieces
		this._transferPiecesOwnership(game, captorId, capturedId);
		
		// Transfer 50% of the fees paid by the defeated player
		this._transferFees(game, captorId, capturedId);
		
		// Emit king capture event
		this.emitGameEvent(game.id, 'kingCaptured', {
			captorId,
			capturedId
		});
		
		// Check if only one player with a king remains (game winner)
		const playersWithKings = this._getPlayersWithKings(game);
		if (playersWithKings.length === 1) {
			// Declare winner
			this.emitGameEvent(game.id, 'gameWinner', {
				winnerId: playersWithKings[0],
				gameId: game.id
			});
			
			// Mark game as ended
			game.ended = true;
			game.endTime = Date.now();
			game.winnerId = playersWithKings[0];
		}
	}
	
	/**
	 * Transfer ownership of pieces from defeated player to victor
	 * @param {Object} game - The game object
	 * @param {string} captorId - ID of the player capturing the king
	 * @param {string} capturedId - ID of the player whose king was captured
	 * @private
	 */
	_transferPiecesOwnership(game, captorId, capturedId) {
		// Find all pieces belonging to the captured player (except the king)
		const capturedPieces = game.chessPieces.filter(piece => 
			piece.player === capturedId && piece.type !== 'king'
		);
		
		// Transfer ownership to the captor
		for (const piece of capturedPieces) {
			piece.player = captorId;
			
			// Reset move counter for pawns
			if (piece.type === 'pawn') {
				piece.moveCount = 0;
			}
			
			// Log the transfer
			this.log(`Piece ${piece.id} (${piece.type}) transferred from ${capturedId} to ${captorId}`);
		}
		
		// Remove the captured king
		const kingIndex = game.chessPieces.findIndex(piece => 
			piece.player === capturedId && piece.type === 'king'
		);
		
		if (kingIndex !== -1) {
			game.chessPieces.splice(kingIndex, 1);
		}
		
		// Emit piece transfer event
		this.emitGameEvent(game.id, 'piecesTransferred', {
			from: capturedId,
			to: captorId,
			count: capturedPieces.length
		});
	}
	
	/**
	 * Transfer 50% of fees paid by defeated player to victor
	 * @param {Object} game - The game object
	 * @param {string} captorId - ID of the player capturing the king
	 * @param {string} capturedId - ID of the player whose king was captured
	 * @private
	 */
	_transferFees(game, captorId, capturedId) {
		if (!game.transactions) return;
		
		// Calculate total fees paid by captured player
		const capturedPlayerFees = game.transactions
			.filter(tx => tx.type === 'piece_purchase' && tx.playerId === capturedId)
			.reduce((total, tx) => total + tx.amount, 0);
		
		if (capturedPlayerFees <= 0) return;
		
		// Calculate 50% of fees to transfer
		const transferAmount = capturedPlayerFees * 0.5;
		
		// Record the transaction
		game.transactions.push({
			type: 'fee_transfer',
			from: capturedId,
			to: captorId,
			amount: transferAmount,
			timestamp: Date.now()
		});
		
		// Log the transfer
		this.log(`Transferred ${transferAmount} SOL (50% of ${capturedPlayerFees}) from ${capturedId} to ${captorId}`);
		
		// Emit fee transfer event
		this.emitGameEvent(game.id, 'feesTransferred', {
			from: capturedId,
			to: captorId,
			amount: transferAmount
		});
	}
	
	/**
	 * Get array of player IDs who still have kings
	 * @param {Object} game - The game object
	 * @returns {Array} - Array of player IDs with kings
	 * @private
	 */
	_getPlayersWithKings(game) {
		const playersWithKings = new Set();
		
		for (const piece of game.chessPieces) {
			if (piece.type === 'king') {
				playersWithKings.add(piece.player);
			}
		}
		
		return Array.from(playersWithKings);
	}
	
	/**
	 * Get a tetromino shape based on type and rotation
	 * @param {string} shape - Tetromino shape (I, J, L, O, S, T, Z)
	 * @param {number} rotation - Rotation (0-3)
	 * @returns {Array} 2D array representing the tetromino shape
	 * @private
	 */
	_getTetromino(shape, rotation) {
		// Define standard tetromino shapes
		const tetrominoShapes = {
			'I': [
				[[1, 1, 1, 1]],
				[[1], [1], [1], [1]]
			],
			'J': [
				[[1, 0, 0], [1, 1, 1]],
				[[1, 1], [1, 0], [1, 0]],
				[[1, 1, 1], [0, 0, 1]],
				[[0, 1], [0, 1], [1, 1]]
			],
			'L': [
				[[0, 0, 1], [1, 1, 1]],
				[[1, 0], [1, 0], [1, 1]],
				[[1, 1, 1], [1, 0, 0]],
				[[1, 1], [0, 1], [0, 1]]
			],
			'O': [
				[[1, 1], [1, 1]]
			],
			'S': [
				[[0, 1, 1], [1, 1, 0]],
				[[1, 0], [1, 1], [0, 1]]
			],
			'T': [
				[[0, 1, 0], [1, 1, 1]],
				[[1, 0], [1, 1], [1, 0]],
				[[1, 1, 1], [0, 1, 0]],
				[[0, 1], [1, 1], [0, 1]]
			],
			'Z': [
				[[1, 1, 0], [0, 1, 1]],
				[[0, 1], [1, 1], [1, 0]]
			]
		};
		
		// Return the shape for the given rotation
		return tetrominoShapes[shape] ? tetrominoShapes[shape][rotation % 4] : null;
	}
	
	/**
	 * Check if a tetromino can be placed at the specified position
	 * @param {Object} game - The game state
	 * @param {Array|Object} tetromino - The tetromino shape (2D array or object with shape property)
	 * @param {number} x - X coordinate (top-left corner)
	 * @param {number} z - Z coordinate (top-left corner)
	 * @param {number} y - Y coordinate (height level, default is 0)
	 * @param {string} playerId - The player's ID
	 * @returns {boolean} True if the tetromino can be placed
	 * @private
	 */
	_canPlaceTetromino(game, tetromino, x, z, y = 0, playerId) {
		// Handle both array and object formats for tetromino
		const shape = Array.isArray(tetromino) ? tetromino : tetromino.shape;
		const depth = shape.length;
		const width = shape[0].length;
		const boardSize = game.settings.boardSize;
		
		// Y-axis logic (tetrominos fall along Y-axis)
		if (y === 1) {
			// When a Tetris piece gets to Y=1, if there is a cell underneath, it should explode to nothing
			for (let i = 0; i < depth; i++) {
				for (let j = 0; j < width; j++) {
					if (shape[i][j] && this.
	/**
	 * Check if a cell has another cell underneath it
	 * @param {Object} game - The game state
	 * @param {number} x - X coordinate
	 * @param {number} z - Z coordinate
	 * @returns {boolean} True if there's a cell underneath
	 * @private
	 */
	_hasCellUnderneath(game, x, z) {
		const boardSize = game.settings.boardSize;
		
		// Check bounds
		if (x < 0 || x >= boardSize || z < 0 || z >= boardSize) {
			return false;
		}
		
		// Check if there's a cell at this position
		return game.board[z][x] !== null;
	}
}

// Export the GameManager class
module.exports = GameManager;
