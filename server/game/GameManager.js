/**
 * GameManager - Handles core game logic and state on the server side
 * This class is responsible for maintaining game rules and preventing cheating
 */

class GameManager {
	constructor() {
		// Store all active games
		this.games = new Map();
		
		// Constants
		this.MAX_PLAYERS_PER_GAME = 2048;
		this.MIN_HOME_ZONE_DISTANCE = 8;
		this.MAX_HOME_ZONE_DISTANCE = 12;
		this.DEFAULT_GAME_ID = 'default-game';
		
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
					cellSize: options.cellSize || 1
				},
				startTime: Date.now(),
				lastUpdate: Date.now()
			};
			
			// Store the game
			this.games.set(gameId, game);
			
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
	 * @param {string} gameId - Game ID (defaults to the default game)
	 * @param {string} playerId - Player ID
	 * @param {string} username - Player username
	 * @returns {Object} Player addition result
	 */
	addPlayer(gameId = this.DEFAULT_GAME_ID, playerId, username) {
		try {
			// Get the game
			const game = this.games.get(gameId);
			
			if (!game) {
				return { 
					success: false, 
					error: `Game ${gameId} not found` 
				};
			}
			
			// Check if the player limit has been reached
			if (Object.keys(game.players).length >= this.MAX_PLAYERS_PER_GAME) {
				return { 
					success: false, 
					error: 'Maximum number of players reached for this game' 
				};
			}
			
			// Check if the player already exists
			if (game.players[playerId]) {
				return { 
					success: false, 
					error: 'Player already exists in this game' 
				};
			}
			
			// Generate a color for the player
			const color = this._generatePlayerColor(Object.values(game.players));
			
			// Find a free position for the player's home zone
			const homeZonePosition = this._findFreeHomeZoneSpot(game);
			
			if (!homeZonePosition) {
				// If board is full, expand it first
				if (game.settings.expandBoardAsNeeded) {
					this._expandBoard(game, 10, 10); // Add 10 rows and columns
					// Try finding a spot again
					const expandedPosition = this._findFreeHomeZoneSpot(game);
					
					if (!expandedPosition) {
						return { 
							success: false, 
							error: 'Could not find a free spot for player home zone' 
						};
					}
					
					homeZonePosition = expandedPosition;
				} else {
					return { 
						success: false, 
						error: 'Could not find a free spot for player home zone' 
					};
				}
			}
			
			// Create the player
			const player = {
				id: playerId,
				username: username || `Player_${playerId.substring(0, 5)}`,
				color,
				homeZone: homeZonePosition,
				pieces: [],
				score: 0,
				joinedAt: Date.now()
			};
			
			// Add player to the game
			game.players[playerId] = player;
			
			// Create home zone and chess pieces for the player
			this._createHomeZoneForPlayer(game, playerId);
			
			// Update last update timestamp
			game.lastUpdate = Date.now();
			
			return { 
				success: true, 
				player 
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
	 * Move a chess piece for a player
	 * @param {string} gameId - Game ID
	 * @param {string} playerId - Player making the move
	 * @param {Object} moveData - Move data (from, to coordinates)
	 * @returns {Object} Result of the move
	 */
	moveChessPiece(gameId, playerId, moveData) {
		// Get the game state
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game ${gameId} not found`);
		}
		
		// Check if player exists in the game
		if (!game.players[playerId]) {
			throw new Error(`Player ${playerId} not found in game ${gameId}`);
		}
		
		// Validate coordinates
		const { fromX, fromY, toX, toY } = moveData;
		this._validateCoordinates(game, fromX, fromY);
		this._validateCoordinates(game, toX, toY);
		
		// Get the piece at the starting position
		const fromCell = game.board[fromY][fromX];
		
		// Check if there's a piece at the starting position
		if (!fromCell || !fromCell.chessPiece) {
			throw new Error(`No chess piece found at position (${fromX}, ${fromY})`);
		}
		
		// Check if the piece belongs to the player
		if (fromCell.chessPiece.player !== playerId) {
			throw new Error(`The piece at (${fromX}, ${fromY}) doesn't belong to player ${playerId}`);
		}
		
		// Get the destination cell
		const toCell = game.board[toY][toX];
		
		// Check if the destination is valid for the piece type
		if (!this._isValidChessMove(game, fromCell.chessPiece, fromX, fromY, toX, toY)) {
			throw new Error(`Invalid move for ${fromCell.chessPiece.type} from (${fromX}, ${fromY}) to (${toX}, ${toY})`);
		}
		
		// Perform the move
		const result = {
			movedPiece: fromCell.chessPiece,
			capture: null
		};
		
		// Check if there's a capture (piece at destination)
		if (toCell && toCell.chessPiece) {
			// Cannot capture own pieces
			if (toCell.chessPiece.player === playerId) {
				throw new Error(`Cannot capture your own piece at (${toX}, ${toY})`);
			}
			
			// Record the captured piece
			result.capture = toCell.chessPiece;
			
			// Handle king capture - transfer all pieces to the capturing player
			if (toCell.chessPiece.type === 'king') {
				this._handleKingCapture(game, playerId, toCell.chessPiece.player);
			}
		}
		
		// Move the piece
		if (!toCell) {
			// Create a new cell if none exists
			game.board[toY][toX] = {
				type: 'cell',
				player: playerId,
				chessPiece: fromCell.chessPiece
			};
		} else {
			// Update existing cell
			toCell.chessPiece = fromCell.chessPiece;
		}
		
		// Remove the piece from the original cell
		fromCell.chessPiece = null;
		
		// Update the last updated timestamp
		game.lastUpdate = Date.now();
		
		return result;
	}
	
	/**
	 * Place a Tetris piece on the board
	 * @param {string} gameId - Game ID
	 * @param {string} playerId - Player placing the piece
	 * @param {Object} pieceData - Piece data (shape, rotation, position)
	 * @returns {Object} Result of the placement
	 */
	placeTetrisPiece(gameId, playerId, pieceData) {
		// Get the game state
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game ${gameId} not found`);
		}
		
		// Check if player exists in the game
		if (!game.players[playerId]) {
			throw new Error(`Player ${playerId} not found in game ${gameId}`);
		}
		
		// Extract piece data
		const { shape, rotation, x, y } = pieceData;
		
		// Get the tetromino shape based on shape and rotation
		const tetromino = this._getTetromino(shape, rotation);
		if (!tetromino) {
			throw new Error(`Invalid tetromino shape or rotation: ${shape}, ${rotation}`);
		}
		
		// Check if the piece can be placed (has connectivity to existing cells)
		if (!this._canPlaceTetromino(game, tetromino, x, y, playerId)) {
			throw new Error(`Cannot place tetromino at (${x}, ${y}) - no connectivity`);
		}
		
		// Place the tetromino on the board
		const placedCells = this._placeTetromino(game, tetromino, x, y, playerId);
		
		// Check for completed rows and clear them
		const clearedRows = this._checkAndClearRows(game);
		
		// Update the last updated timestamp
		game.lastUpdate = Date.now();
		
		return {
			placedCells,
			clearedRows
		};
	}
	
	/**
	 * Get the current state of a game
	 * @param {string} gameId - Game ID
	 * @returns {Object} The current game state
	 */
	getGameState(gameId) {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game ${gameId} not found`);
		}
		
		return game;
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
	 * @param {number} width - Board width
	 * @param {number} height - Board height
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
	 * Generate a unique color for a player
	 * @param {Object} existingPlayers - Existing players in the game
	 * @returns {number} A color hex value
	 * @private
	 */
	_generatePlayerColor(existingPlayers) {
		// List of distinct colors
		const baseColors = [
			0x3498db, // Blue
			0xe74c3c, // Red
			0x2ecc71, // Green
			0xf39c12, // Orange
			0x9b59b6, // Purple
			0x1abc9c, // Teal
			0xd35400, // Dark Orange
			0x34495e  // Navy Blue
		];
		
		// Get colors already in use
		const usedColors = Object.values(existingPlayers).map(p => p.color);
		
		// Find the first unused color
		for (const color of baseColors) {
			if (!usedColors.includes(color)) {
				return color;
			}
		}
		
		// If all colors are used, generate a random one
		return Math.floor(Math.random() * 0xFFFFFF);
	}
	
	/**
	 * Find a free spot for a player's home zone
	 * @param {Object} game - The game object
	 * @returns {Object|null} The position for the home zone, or null if no spot is available
	 * @private
	 */
	_findFreeHomeZoneSpot(game) {
		// Define home zone dimensions
		const homeZoneWidth = 8;
		const homeZoneHeight = 2;
		const boardWidth = game.board[0].length;
		const boardHeight = game.board.length;
		
		// Minimum distance between home zones based on settings
		const minDistance = game.settings.minHomeZoneDistance || this.MIN_HOME_ZONE_DISTANCE;
		
		// Get existing players' home zone positions
		const existingZones = Object.values(game.players)
			.filter(player => player.homeZone)
			.map(player => player.homeZone);
		
		// If this is the first player, place them in the bottom center
		if (existingZones.length === 0) {
			const startX = Math.floor((boardWidth - homeZoneWidth) / 2);
			const startY = boardHeight - homeZoneHeight - 2; // Near the bottom
			
			return {
				x: startX,
				y: startY
			};
		}
		
		// Try a grid of potential positions
		const gridStepX = Math.floor(boardWidth / 5);
		const gridStepY = Math.floor(boardHeight / 5);
		
		// Prioritize positions farther from existing zones
		const candidatePositions = [];
		
		for (let y = 2; y < boardHeight - homeZoneHeight - 2; y += gridStepY) {
			for (let x = 2; x < boardWidth - homeZoneWidth - 2; x += gridStepX) {
				let isValid = true;
				
				// Check if this position overlaps with existing home zones
				for (const zone of existingZones) {
					const distance = Math.sqrt(
						Math.pow(zone.x - x, 2) + 
						Math.pow(zone.y - y, 2)
					);
					
					if (distance < minDistance) {
						isValid = false;
						break;
					}
				}
				
				if (isValid) {
					// Calculate the average distance to all existing zones
					let totalDistance = 0;
					for (const zone of existingZones) {
						totalDistance += Math.sqrt(
							Math.pow(zone.x - x, 2) + 
							Math.pow(zone.y - y, 2)
						);
					}
					const averageDistance = totalDistance / existingZones.length;
					
					candidatePositions.push({
						x, y, 
						score: averageDistance // Higher score means farther away
					});
				}
			}
		}
		
		// If we found valid positions, return the one with the highest score
		if (candidatePositions.length > 0) {
			candidatePositions.sort((a, b) => b.score - a.score);
			return {
				x: candidatePositions[0].x,
				y: candidatePositions[0].y
			};
		}
		
		// If the board is too small, we might need to expand it
		if (game.settings.expandBoardAsNeeded) {
			// Expand the board and try again
			this._expandBoard(game, homeZoneWidth * 2, homeZoneHeight * 2);
			return this._findFreeHomeZoneSpot(game);
		}
		
		// No valid position found
		return null;
	}
	
	/**
	 * Check if two rectangles overlap
	 * @param {number} x1 - First rectangle X
	 * @param {number} y1 - First rectangle Y
	 * @param {number} w1 - First rectangle width
	 * @param {number} h1 - First rectangle height
	 * @param {number} x2 - Second rectangle X
	 * @param {number} y2 - Second rectangle Y
	 * @param {number} w2 - Second rectangle width
	 * @param {number} h2 - Second rectangle height
	 * @returns {boolean} True if rectangles overlap
	 * @private
	 */
	_isRectangleOverlapping(x1, y1, w1, h1, x2, y2, w2, h2) {
		// Add a buffer zone around the rectangles
		const buffer = 2; // Number of cells buffer between home zones
		x1 -= buffer;
		y1 -= buffer;
		w1 += buffer * 2;
		h1 += buffer * 2;
		
		// Check for overlap
		return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
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
			
			// Add chess pieces
			const pieces = [];
			
			// Add pawns (front row)
			for (let x = 0; x < homeZoneWidth; x++) {
				const pawn = {
					id: `${playerId}_pawn_${x}`,
					type: 'pawn',
					player: playerId,
					x: startX + x,
					y: startY,
					moveCount: 0
				};
				
				pieces.push(pawn);
				
				// Add pawn to the board
				game.board[startY][startX + x].chessPiece = pawn;
			}
			
			// Add other pieces (back row)
			const backRow = [
				{ type: 'rook', id: `${playerId}_rook_1` },
				{ type: 'knight', id: `${playerId}_knight_1` },
				{ type: 'bishop', id: `${playerId}_bishop_1` },
				{ type: 'queen', id: `${playerId}_queen` },
				{ type: 'king', id: `${playerId}_king` },
				{ type: 'bishop', id: `${playerId}_bishop_2` },
				{ type: 'knight', id: `${playerId}_knight_2` },
				{ type: 'rook', id: `${playerId}_rook_2` }
			];
			
			for (let x = 0; x < backRow.length; x++) {
				const piece = {
					...backRow[x],
					player: playerId,
					x: startX + x,
					y: startY + 1
				};
				
				pieces.push(piece);
				
				// Add piece to the board
				game.board[startY + 1][startX + x].chessPiece = piece;
			}
			
			// Store the pieces in the player object
			player.pieces = pieces;
		} catch (error) {
			console.error('Error creating home zone:', error);
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
	 * Check if a chess move is valid based on piece type and game rules
	 * @param {Object} game - The game state
	 * @param {Object} piece - The chess piece
	 * @param {number} fromX - Starting X coordinate
	 * @param {number} fromY - Starting Y coordinate
	 * @param {number} toX - Destination X coordinate
	 * @param {number} toY - Destination Y coordinate
	 * @returns {boolean} True if the move is valid
	 * @private
	 */
	_isValidChessMove(game, piece, fromX, fromY, toX, toY) {
		// Implement chess movement rules based on piece type
		const dx = Math.abs(toX - fromX);
		const dy = Math.abs(toY - fromY);
		
		// Simple implementations for basic movement validation
		switch (piece.type.toLowerCase()) {
			case 'pawn':
				// Pawns move forward one square
				return dx === 0 && dy === 1;
				
			case 'rook':
				// Rooks move in straight lines
				return (dx === 0 && dy > 0) || (dx > 0 && dy === 0);
				
			case 'knight':
				// Knights move in L-shape
				return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
				
			case 'bishop':
				// Bishops move diagonally
				return dx === dy && dx > 0;
				
			case 'queen':
				// Queens move in straight lines or diagonally
				return (dx === 0 && dy > 0) || (dx > 0 && dy === 0) || (dx === dy && dx > 0);
				
			case 'king':
				// Kings move one square in any direction
				return dx <= 1 && dy <= 1 && (dx > 0 || dy > 0);
				
			default:
				return false;
		}
	}
	
	/**
	 * Handle a king capture event
	 * @param {Object} game - The game state
	 * @param {string} captorId - ID of the player who captured the king
	 * @param {string} capturedId - ID of the player whose king was captured
	 * @private
	 */
	_handleKingCapture(game, captorId, capturedId) {
		// When a king is captured:
		// 1. All pieces of the captured player are transferred to the captor
		// 2. The captured player's home zone is dissolved
		
		// Get the players
		const captor = game.players[captorId];
		const captured = game.players[capturedId];
		
		if (!captor || !captured) return;
		
		// Transfer all pieces
		for (let y = 0; y < game.board.length; y++) {
			for (let x = 0; x < game.board[y].length; x++) {
				const cell = game.board[y][x];
				if (cell && cell.chessPiece && cell.chessPiece.player === capturedId) {
					// Transfer ownership of this piece to the captor
					cell.chessPiece.player = captorId;
					
					// Also update the cell owner if it was owned by the captured player
					if (cell.player === capturedId) {
						cell.player = captorId;
					}
					
					// Add the piece to the captor's pieces array
					captor.pieces.push(cell.chessPiece);
				}
			}
		}
		
		// Remove the captured player's pieces from their array
		captured.pieces = [];
		
		// Award points to the captor
		captor.score += 100; // Base points for king capture
		
		// TODO: Additional logic for dissolving the home zone,
		// transferring resources, etc.
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
		const tetrominos = {
			'I': [
				[[1, 1, 1, 1]],
				[[1], [1], [1], [1]],
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
				[[1, 1], [1, 1]],
				[[1, 1], [1, 1]],
				[[1, 1], [1, 1]],
				[[1, 1], [1, 1]]
			],
			'S': [
				[[0, 1, 1], [1, 1, 0]],
				[[1, 0], [1, 1], [0, 1]],
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
				[[0, 1], [1, 1], [1, 0]],
				[[1, 1, 0], [0, 1, 1]],
				[[0, 1], [1, 1], [1, 0]]
			]
		};
		
		// Return the shape for the given rotation
		return tetrominos[shape] ? tetrominos[shape][rotation % 4] : null;
	}
	
	/**
	 * Check if a tetromino can be placed at the given position
	 * @param {Object} game - The game state
	 * @param {Array} tetromino - The tetromino shape
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @param {string} playerId - The player placing the piece
	 * @returns {boolean} True if the piece can be placed
	 * @private
	 */
	_canPlaceTetromino(game, tetromino, x, y, playerId) {
		// A tetromino can be placed if:
		// 1. It's within the board bounds
		// 2. It doesn't overlap with existing cells
		// 3. At least one block is adjacent to an existing cell owned by the player
		
		let hasAdjacency = false;
		
		// Check each block of the tetromino
		for (let ty = 0; ty < tetromino.length; ty++) {
			for (let tx = 0; tx < tetromino[ty].length; tx++) {
				// Skip empty blocks
				if (tetromino[ty][tx] !== 1) continue;
				
				const boardX = x + tx;
				const boardY = y + ty;
				
				// Check bounds
				if (boardX < 0 || boardX >= game.settings.boardSize ||
					boardY < 0 || boardY >= game.settings.boardSize) {
					return false;
				}
				
				// Check for overlap
				if (game.board[boardY][boardX] !== null) {
					return false;
				}
				
				// Check for adjacency
				if (this._hasAdjacentCell(game, boardX, boardY, playerId)) {
					hasAdjacency = true;
				}
			}
		}
		
		return hasAdjacency;
	}
	
	/**
	 * Check if a position has an adjacent cell owned by the player
	 * @param {Object} game - The game state
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @param {string} playerId - The player's ID
	 * @returns {boolean} True if there's adjacency
	 * @private
	 */
	_hasAdjacentCell(game, x, y, playerId) {
		// Check the four adjacent cells
		const adjacentPositions = [
			{ x: x - 1, y }, // Left
			{ x: x + 1, y }, // Right
			{ x, y: y - 1 }, // Up
			{ x, y: y + 1 }  // Down
		];
		
		for (const pos of adjacentPositions) {
			// Check bounds
			if (pos.x < 0 || pos.x >= game.settings.boardSize ||
				pos.y < 0 || pos.y >= game.settings.boardSize) {
				continue;
			}
			
			// Check if the cell exists and belongs to the player
			const cell = game.board[pos.y][pos.x];
			if (cell && cell.player === playerId) {
				return true;
			}
		}
		
		return false;
	}
	
	/**
	 * Place a tetromino on the board
	 * @param {Object} game - The game state
	 * @param {Array} tetromino - The tetromino shape
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @param {string} playerId - The player's ID
	 * @returns {Array} Coordinates of the placed cells
	 * @private
	 */
	_placeTetromino(game, tetromino, x, y, playerId) {
		const placedCells = [];
		
		// Place each block of the tetromino
		for (let ty = 0; ty < tetromino.length; ty++) {
			for (let tx = 0; tx < tetromino[ty].length; tx++) {
				// Skip empty blocks
				if (tetromino[ty][tx] !== 1) continue;
				
				const boardX = x + tx;
				const boardY = y + ty;
				
				// Create a cell for this block
				game.board[boardY][boardX] = {
					type: 'tetris',
					player: playerId,
					chessPiece: null
				};
				
				// Record the placed cell
				placedCells.push({ x: boardX, y: boardY });
			}
		}
		
		return placedCells;
	}
	
	/**
	 * Check for completed rows and clear them
	 * @param {Object} game - The game state
	 * @returns {Array} Indices of cleared rows
	 * @private
	 */
	_checkAndClearRows(game) {
		const boardSize = game.settings.boardSize;
		const clearedRows = [];
		
		// Check each row
		for (let y = 0; y < boardSize; y++) {
			// Check if the row is full
			let isFull = true;
			for (let x = 0; x < boardSize; x++) {
				// Skip cells in home zones
				if (!game.board[y][x] || this._isCellInHomeZone(game, x, y)) {
					isFull = false;
					break;
				}
			}
			
			// If the row is full, clear it
			if (isFull) {
				this._clearRow(game, y);
				clearedRows.push(y);
			}
		}
		
		return clearedRows;
	}
	
	/**
	 * Check if a cell is in any player's home zone
	 * @param {Object} game - The game state
	 * @param {number} x - X coordinate
	 * @param {number} y - Y coordinate
	 * @returns {boolean} True if the cell is in a home zone
	 * @private
	 */
	_isCellInHomeZone(game, x, y) {
		// Check all players' home zones
		for (const player of Object.values(game.players)) {
			const { x: zoneX, z: zoneZ, width, height } = player.homeZone;
			
			// Check if the cell is within this home zone
			if (x >= zoneX && x < zoneX + width && y >= zoneZ && y < zoneZ + height) {
				return true;
			}
		}
		
		return false;
	}
	
	/**
	 * Clear a row on the board
	 * @param {Object} game - The game state
	 * @param {number} rowIndex - Index of the row to clear
	 * @private
	 */
	_clearRow(game, rowIndex) {
		const boardSize = game.settings.boardSize;
		
		// Clear the row (except for cells in home zones)
		for (let x = 0; x < boardSize; x++) {
			// Skip cells in home zones
			if (this._isCellInHomeZone(game, x, rowIndex)) {
				continue;
			}
			
			// Get the cell
			const cell = game.board[rowIndex][x];
			
			// If the cell has a chess piece, handle it
			if (cell && cell.chessPiece) {
				// Remove the piece from the player's array
				const player = game.players[cell.chessPiece.player];
				if (player) {
					player.pieces = player.pieces.filter(p => p.id !== cell.chessPiece.id);
				}
			}
			
			// Clear the cell
			game.board[rowIndex][x] = null;
		}
		
		// Shift all rows above this one down
		for (let y = rowIndex - 1; y >= 0; y--) {
			for (let x = 0; x < boardSize; x++) {
				// Skip cells in home zones
				if (this._isCellInHomeZone(game, x, y)) {
					continue;
				}
				
				// Move the cell down
				game.board[y + 1][x] = game.board[y][x];
				game.board[y][x] = null;
			}
		}
	}
}

export default GameManager;