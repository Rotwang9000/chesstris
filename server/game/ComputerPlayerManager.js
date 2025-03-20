/**
 * ComputerPlayerManager.js - Manages computer players (AI) in the game
 */

const { DIFFICULTY_SETTINGS } = require('./Constants');
const { log } = require('./GameUtilities');

class ComputerPlayerManager {
	constructor(playerManager) {
		this.playerManager = playerManager;
		this.computerPlayers = {};
		this.moveIntervals = {};
	}
	
	/**
	 * Initialize a computer player in the game
	 * @param {Object} game - The game object
	 * @param {string} difficulty - The difficulty level (easy, medium, hard)
	 * @returns {Object} The created computer player
	 */
	initializeComputerPlayer(game, difficulty = 'medium') {
		try {
			// Check if the game can accept more players
			const playerCount = Object.values(game.players).filter(p => !p.isObserver).length;
			if (playerCount >= game.maxPlayers) {
				throw new Error(`Game has reached maximum player limit of ${game.maxPlayers}`);
			}
			
			// Generate a unique ID for the computer player
			const computerId = `computer-${Date.now()}-${Object.keys(this.computerPlayers).length}`;
			const computerName = `Computer ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`;
			
			// Register the computer player in the game
			const registerResult = this.playerManager.registerPlayer(game, computerId, computerName);
			
			if (!registerResult.success) {
				throw new Error(`Failed to register computer player: ${registerResult.error}`);
			}
			
			// Set the difficulty level
			const difficultySettings = DIFFICULTY_SETTINGS[difficulty.toUpperCase()] || DIFFICULTY_SETTINGS.MEDIUM;
			
			// Store the computer player info
			this.computerPlayers[computerId] = {
				id: computerId,
				difficulty,
				settings: difficultySettings,
				lastMove: Date.now(),
				game: game.id
			};
			
			// Mark the player as ready immediately
			this.playerManager.setPlayerReady(game, computerId, true);
			
			// Start the AI move loop if the game is active
			if (game.status === 'active') {
				this._startMoveLoop(game, computerId);
			}
			
			log(`Initialized computer player ${computerName} (${computerId}) with ${difficulty} difficulty`);
			
			return {
				success: true,
				computerId,
				computerName,
				difficulty
			};
		} catch (error) {
			log(`Error initializing computer player: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Remove a computer player from the game
	 * @param {Object} game - The game object
	 * @param {string} computerId - The computer player's ID
	 * @returns {Object} Result of the removal
	 */
	removeComputerPlayer(game, computerId) {
		try {
			// Check if the computer player exists
			if (!this.computerPlayers[computerId]) {
				return {
					success: false,
					error: 'Computer player not found'
				};
			}
			
			// Stop the move loop
			this._stopMoveLoop(computerId);
			
			// Remove the player from the game
			const removeResult = this.playerManager.removePlayer(game, computerId);
			
			// Remove from our tracking
			delete this.computerPlayers[computerId];
			
			log(`Removed computer player ${computerId}`);
			
			return {
				success: true,
				...removeResult
			};
		} catch (error) {
			log(`Error removing computer player: ${error.message}`);
			return {
				success: false,
				error: error.message
			};
		}
	}
	
	/**
	 * Start the AI move loop for a computer player
	 * @param {Object} game - The game object
	 * @param {string} computerId - The computer player's ID
	 * @private
	 */
	_startMoveLoop(game, computerId) {
		// Stop any existing loop
		this._stopMoveLoop(computerId);
		
		const computerPlayer = this.computerPlayers[computerId];
		if (!computerPlayer) return;
		
		// Get move interval from difficulty settings
		const moveInterval = computerPlayer.settings.MOVE_INTERVAL;
		
		// Start a new move loop
		this.moveIntervals[computerId] = setInterval(() => {
			this._makeMove(game, computerId);
		}, moveInterval);
		
		log(`Started move loop for computer player ${computerId} with interval ${moveInterval}ms`);
	}
	
	/**
	 * Stop the AI move loop for a computer player
	 * @param {string} computerId - The computer player's ID
	 * @private
	 */
	_stopMoveLoop(computerId) {
		if (this.moveIntervals[computerId]) {
			clearInterval(this.moveIntervals[computerId]);
			delete this.moveIntervals[computerId];
			log(`Stopped move loop for computer player ${computerId}`);
		}
	}
	
	/**
	 * Make a move for a computer player
	 * @param {Object} game - The game object
	 * @param {string} computerId - The computer player's ID
	 * @private
	 */
	_makeMove(game, computerId) {
		try {
			// Check if the game is still active
			if (game.status !== 'active') {
				this._stopMoveLoop(computerId);
				return;
			}
			
			// Check if the player exists and is not eliminated
			const player = game.players[computerId];
			if (!player || player.eliminated) {
				this._stopMoveLoop(computerId);
				return;
			}
			
			// Determine what type of move to make based on a smart strategy
			const moveType = this._determineMoveType(game, computerId);
			
			// Make the appropriate move
			switch (moveType) {
				case 'tetromino':
					this._makeTetrominoMove(game, computerId);
					break;
					
				case 'chess':
					this._makeChessMove(game, computerId);
					break;
					
				case 'purchase':
					this._makePurchaseMove(game, computerId);
					break;
					
				default:
					// Default to tetromino move if no good move is found
					this._makeTetrominoMove(game, computerId);
					break;
			}
			
			// Update last move timestamp
			this.computerPlayers[computerId].lastMove = Date.now();
		} catch (error) {
			log(`Error making move for computer player ${computerId}: ${error.message}`);
		}
	}
	
	/**
	 * Determine what type of move to make
	 * @param {Object} game - The game object
	 * @param {string} computerId - The computer player's ID
	 * @returns {string} The type of move to make (tetromino, chess, purchase)
	 * @private
	 */
	_determineMoveType(game, computerId) {
		const player = game.players[computerId];
		const computerPlayer = this.computerPlayers[computerId];
		const difficulty = computerPlayer.difficulty;
		
		// Priority based on game state and difficulty
		
		// Check if we can make chess moves
		const chessPieces = game.chessPieces.filter(p => p.player === computerId);
		const hasChessPieces = chessPieces.length > 0;
		
		// Check if we can afford to purchase pieces
		const canAffordPiece = player.balance >= 10; // Minimum piece cost
		
		// Check if we have tetrominos available
		const hasTetrominos = player.availableTetrominos && player.availableTetrominos.length > 0;
		
		// Decision making strategy based on difficulty
		switch (difficulty) {
			case 'easy':
				// Easy AI prefers tetromino moves, occasionally making chess moves
				if (Math.random() < 0.2 && hasChessPieces) {
					return 'chess';
				} else if (Math.random() < 0.1 && canAffordPiece) {
					return 'purchase';
				} else if (hasTetrominos) {
					return 'tetromino';
				}
				break;
				
			case 'medium':
				// Medium AI balances between tetromino and chess moves
				if (Math.random() < 0.4 && hasChessPieces) {
					return 'chess';
				} else if (Math.random() < 0.2 && canAffordPiece) {
					return 'purchase';
				} else if (hasTetrominos) {
					return 'tetromino';
				}
				break;
				
			case 'hard':
				// Hard AI strategically chooses moves based on game state
				// Prioritize chess moves if we have pieces and a strategic opportunity
				if (Math.random() < 0.6 && hasChessPieces) {
					return 'chess';
				} else if (Math.random() < 0.3 && canAffordPiece) {
					return 'purchase';
				} else if (hasTetrominos) {
					return 'tetromino';
				}
				break;
				
			default:
				// Default to medium difficulty
				if (Math.random() < 0.4 && hasChessPieces) {
					return 'chess';
				} else if (Math.random() < 0.2 && canAffordPiece) {
					return 'purchase';
				} else if (hasTetrominos) {
					return 'tetromino';
				}
		}
		
		// Default to tetromino move if available
		return hasTetrominos ? 'tetromino' : (hasChessPieces ? 'chess' : 'purchase');
	}
	
	/**
	 * Make a tetromino move for a computer player
	 * @param {Object} game - The game object
	 * @param {string} computerId - The computer player's ID
	 * @private
	 */
	_makeTetrominoMove(game, computerId) {
		const player = game.players[computerId];
		const computerPlayer = this.computerPlayers[computerId];
		
		// Check if we have tetrominos available
		if (!player.availableTetrominos || player.availableTetrominos.length === 0) {
			return;
		}
		
		// Choose a random tetromino from available ones
		const tetromino = player.availableTetrominos[
			Math.floor(Math.random() * player.availableTetrominos.length)
		];
		
		// Find a valid position to place the tetromino
		const boardWidth = game.board[0].length;
		const boardHeight = game.board.length;
		
		// Try multiple random positions to find a valid one
		for (let attempt = 0; attempt < 20; attempt++) {
			// Random position within board bounds
			const x = Math.floor(Math.random() * (boardWidth - 4)); // Adjust for tetromino width
			const z = Math.floor(Math.random() * (boardHeight - 4)); // Adjust for tetromino height
			
			// Randomly decide if we want to try placing at Y=1 (falling piece)
			const y = Math.random() < 0.2 ? 1 : 0;
			
			// Create the move data
			const moveData = {
				pieceType: tetromino.pieceType,
				rotation: tetromino.rotation,
				x,
				z,
				y,
				regenerate: true // Always regenerate tetrominos after placement
			};
			
			// Try to make the move
			const action = {
				type: 'tetromino',
				data: moveData
			};
			
			const result = this.playerManager.handlePlayerAction(game, computerId, action);
			
			if (result.success) {
				log(`Computer player ${computerId} placed tetromino ${tetromino.pieceType} at (${x}, ${z}, ${y})`);
				return;
			}
		}
		
		// If all attempts failed, log the failure
		log(`Computer player ${computerId} failed to place a tetromino after multiple attempts`);
	}
	
	/**
	 * Make a chess move for a computer player
	 * @param {Object} game - The game object
	 * @param {string} computerId - The computer player's ID
	 * @private
	 */
	_makeChessMove(game, computerId) {
		// Get the player's chess pieces
		const chessPieces = game.chessPieces.filter(p => p.player === computerId);
		
		if (chessPieces.length === 0) {
			return;
		}
		
		// Choose a random piece to move
		const piece = chessPieces[Math.floor(Math.random() * chessPieces.length)];
		
		// Generate possible moves based on piece type
		const possibleMoves = this._generatePossibleMoves(game, piece);
		
		if (possibleMoves.length === 0) {
			return;
		}
		
		// Choose a random move from possible moves
		const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
		
		// Create the move data
		const moveData = {
			pieceId: piece.id,
			toX: move.x,
			toZ: move.z
		};
		
		// Try to make the move
		const action = {
			type: 'chess',
			data: moveData
		};
		
		const result = this.playerManager.handlePlayerAction(game, computerId, action);
		
		if (result.success) {
			log(`Computer player ${computerId} moved ${piece.type} to (${move.x}, ${move.z})`);
		} else {
			log(`Computer player ${computerId} failed to move chess piece: ${result.error}`);
		}
	}
	
	/**
	 * Generate possible chess moves for a piece
	 * @param {Object} game - The game object
	 * @param {Object} piece - The chess piece
	 * @returns {Array} Array of possible moves
	 * @private
	 */
	_generatePossibleMoves(game, piece) {
		const possibleMoves = [];
		const boardWidth = game.board[0].length;
		const boardHeight = game.board.length;
		const { x, z, type } = piece;
		
		// Define movement patterns based on piece type
		let movementPatterns = [];
		
		switch (type) {
			case 'pawn':
				// Pawns move forward one step, or diagonally to capture
				movementPatterns = [
					{ dx: 0, dz: 1 }, // Forward
					{ dx: 1, dz: 1 }, // Diagonal right
					{ dx: -1, dz: 1 }  // Diagonal left
				];
				break;
				
			case 'rook':
				// Rooks move horizontally or vertically
				for (let i = 1; i < Math.max(boardWidth, boardHeight); i++) {
					movementPatterns.push({ dx: i, dz: 0 }); // Right
					movementPatterns.push({ dx: -i, dz: 0 }); // Left
					movementPatterns.push({ dx: 0, dz: i }); // Down
					movementPatterns.push({ dx: 0, dz: -i }); // Up
				}
				break;
				
			case 'knight':
				// Knights move in an L-shape
				movementPatterns = [
					{ dx: 1, dz: 2 }, { dx: 2, dz: 1 },
					{ dx: -1, dz: 2 }, { dx: -2, dz: 1 },
					{ dx: 1, dz: -2 }, { dx: 2, dz: -1 },
					{ dx: -1, dz: -2 }, { dx: -2, dz: -1 }
				];
				break;
				
			case 'bishop':
				// Bishops move diagonally
				for (let i = 1; i < Math.max(boardWidth, boardHeight); i++) {
					movementPatterns.push({ dx: i, dz: i }); // Down-right
					movementPatterns.push({ dx: -i, dz: i }); // Down-left
					movementPatterns.push({ dx: i, dz: -i }); // Up-right
					movementPatterns.push({ dx: -i, dz: -i }); // Up-left
				}
				break;
				
			case 'queen':
				// Queens move horizontally, vertically, or diagonally
				for (let i = 1; i < Math.max(boardWidth, boardHeight); i++) {
					// Rook-like moves
					movementPatterns.push({ dx: i, dz: 0 }); // Right
					movementPatterns.push({ dx: -i, dz: 0 }); // Left
					movementPatterns.push({ dx: 0, dz: i }); // Down
					movementPatterns.push({ dx: 0, dz: -i }); // Up
					
					// Bishop-like moves
					movementPatterns.push({ dx: i, dz: i }); // Down-right
					movementPatterns.push({ dx: -i, dz: i }); // Down-left
					movementPatterns.push({ dx: i, dz: -i }); // Up-right
					movementPatterns.push({ dx: -i, dz: -i }); // Up-left
				}
				break;
				
			case 'king':
				// Kings move one step in any direction
				movementPatterns = [
					{ dx: 0, dz: 1 }, { dx: 1, dz: 1 }, { dx: 1, dz: 0 },
					{ dx: 1, dz: -1 }, { dx: 0, dz: -1 }, { dx: -1, dz: -1 },
					{ dx: -1, dz: 0 }, { dx: -1, dz: 1 }
				];
				break;
		}
		
		// Check each potential move
		for (const pattern of movementPatterns) {
			const newX = x + pattern.dx;
			const newZ = z + pattern.dz;
			
			// Check if the move is within bounds
			if (newX >= 0 && newX < boardWidth && newZ >= 0 && newZ < boardHeight) {
				// For simplicity, just add all moves within bounds
				// In a real implementation, we'd check for move validity
				possibleMoves.push({ x: newX, z: newZ });
			}
		}
		
		return possibleMoves;
	}
	
	/**
	 * Make a purchase move for a computer player
	 * @param {Object} game - The game object
	 * @param {string} computerId - The computer player's ID
	 * @private
	 */
	_makePurchaseMove(game, computerId) {
		const player = game.players[computerId];
		const computerPlayer = this.computerPlayers[computerId];
		
		// Available piece types to purchase
		const pieceTypes = ['pawn', 'rook', 'knight', 'bishop', 'queen'];
		
		// Get a random piece type weighted by piece value
		const pieceType = this._getWeightedPieceType(pieceTypes, player.balance, computerPlayer.difficulty);
		
		// Find a valid position to place the piece
		const boardWidth = game.board[0].length;
		const boardHeight = game.board.length;
		
		// Try multiple random positions
		for (let attempt = 0; attempt < 20; attempt++) {
			const x = Math.floor(Math.random() * boardWidth);
			const z = Math.floor(Math.random() * boardHeight);
			
			// Create the purchase data
			const purchaseData = {
				pieceType,
				x,
				z
			};
			
			// Try to make the purchase
			const action = {
				type: 'purchase',
				data: purchaseData
			};
			
			const result = this.playerManager.handlePlayerAction(game, computerId, action);
			
			if (result.success) {
				log(`Computer player ${computerId} purchased ${pieceType} at (${x}, ${z})`);
				return;
			}
		}
		
		// If all attempts failed, log the failure
		log(`Computer player ${computerId} failed to purchase a piece after multiple attempts`);
	}
	
	/**
	 * Get a weighted piece type based on balance and difficulty
	 * @param {Array} pieceTypes - Available piece types
	 * @param {number} balance - Player's balance
	 * @param {string} difficulty - AI difficulty level
	 * @returns {string} Selected piece type
	 * @private
	 */
	_getWeightedPieceType(pieceTypes, balance, difficulty) {
		// Piece weights (probability): more valuable pieces have lower probability
		const weights = {
			pawn: 5,
			knight: 3,
			bishop: 3,
			rook: 2,
			queen: 1
		};
		
		// Filter pieces based on player's balance
		const affordablePieces = pieceTypes.filter(type => PIECE_PRICES[type] <= balance);
		
		if (affordablePieces.length === 0) {
			return pieceTypes[0]; // Default to first piece, will likely fail
		}
		
		// Adjust weights based on difficulty
		const adjustedWeights = {};
		for (const piece of affordablePieces) {
			adjustedWeights[piece] = weights[piece];
			
			// Hard AI prefers stronger pieces
			if (difficulty === 'hard') {
				// Increase weight for stronger pieces
				if (piece === 'queen' || piece === 'rook') {
					adjustedWeights[piece] *= 2;
				}
			}
		}
		
		// Calculate total weight
		let totalWeight = 0;
		for (const piece of affordablePieces) {
			totalWeight += adjustedWeights[piece];
		}
		
		// Random weighted selection
		let random = Math.random() * totalWeight;
		for (const piece of affordablePieces) {
			random -= adjustedWeights[piece];
			if (random <= 0) {
				return piece;
			}
		}
		
		// Fallback
		return affordablePieces[0];
	}
	
	/**
	 * Start AI move loops for all computer players in a game
	 * @param {Object} game - The game object
	 */
	startAllComputerPlayers(game) {
		// Find all computer players for this game
		const gameComputerPlayers = Object.keys(this.computerPlayers)
			.filter(id => this.computerPlayers[id].game === game.id);
		
		// Start move loops for each
		for (const computerId of gameComputerPlayers) {
			this._startMoveLoop(game, computerId);
		}
		
		log(`Started all ${gameComputerPlayers.length} computer players for game ${game.id}`);
	}
	
	/**
	 * Stop AI move loops for all computer players in a game
	 * @param {Object} game - The game object
	 */
	stopAllComputerPlayers(game) {
		// Find all computer players for this game
		const gameComputerPlayers = Object.keys(this.computerPlayers)
			.filter(id => this.computerPlayers[id].game === game.id);
		
		// Stop move loops for each
		for (const computerId of gameComputerPlayers) {
			this._stopMoveLoop(computerId);
		}
		
		log(`Stopped all ${gameComputerPlayers.length} computer players for game ${game.id}`);
	}
}

module.exports = ComputerPlayerManager; 