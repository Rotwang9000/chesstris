/**
 * ComputerPlayerManager.js - Manages computer players (AI) in the game
 */

const { DIFFICULTY_SETTINGS, PIECE_PRICES } = require('./Constants');
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
		
		const moveInterval = computerPlayer.settings.minMoveInterval || 10000;
		
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
		
		if (!player.availableTetrominos || player.availableTetrominos.length === 0) {
			return;
		}
		
		const tetromino = player.availableTetrominos[
			Math.floor(Math.random() * player.availableTetrominos.length)
		];
		
		const board = game.board;
		const minX = Number.isFinite(board.minX) ? board.minX : 0;
		const maxX = Number.isFinite(board.maxX) ? board.maxX : 16;
		const minZ = Number.isFinite(board.minZ) ? board.minZ : 0;
		const maxZ = Number.isFinite(board.maxZ) ? board.maxZ : 16;
		
		// Try positions near the player's own king first, then random
		const homeZone = game.homeZones[computerId];
		const centreX = homeZone ? homeZone.x + 4 : Math.floor((minX + maxX) / 2);
		const centreZ = homeZone ? homeZone.z + 1 : Math.floor((minZ + maxZ) / 2);
		
		for (let attempt = 0; attempt < 30; attempt++) {
			// Bias towards the player's home zone area with increasing spread
			const spread = Math.min(attempt + 2, 12);
			const x = centreX + Math.floor(Math.random() * spread * 2) - spread;
			const z = centreZ + Math.floor(Math.random() * spread * 2) - spread;
			
			const moveData = {
				pieceType: tetromino.pieceType,
				rotation: Math.floor(Math.random() * 4),
				x,
				z,
				y: 0,
				regenerate: true
			};
			
			const action = { type: 'tetromino', data: moveData };
			const result = this.playerManager.handlePlayerAction(game, computerId, action);
			
			if (result.success) {
				log(`Computer player ${computerId} placed tetromino ${tetromino.pieceType} at (${x}, ${z})`);
				return;
			}
		}
		
		log(`Computer player ${computerId} failed to place a tetromino after multiple attempts`);
	}
	
	/**
	 * Make a chess move for a computer player
	 * @param {Object} game - The game object
	 * @param {string} computerId - The computer player's ID
	 * @private
	 */
	_makeChessMove(game, computerId) {
		const chessPieces = (game.chessPieces || []).filter(p => p && p.player === computerId);
		
		if (chessPieces.length === 0) {
			return;
		}
		
		// Shuffle pieces so we don't always try the same one
		const shuffled = chessPieces.sort(() => Math.random() - 0.5);
		
		for (const piece of shuffled) {
			const possibleMoves = this._generatePossibleMoves(game, piece);
			if (possibleMoves.length === 0) continue;
			
			const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
			
			const action = {
				type: 'chess',
				data: { pieceId: piece.id, toX: move.x, toZ: move.z }
			};
			
			const result = this.playerManager.handlePlayerAction(game, computerId, action);
			
			if (result.success) {
				log(`Computer player ${computerId} moved ${piece.type} to (${move.x}, ${move.z})`);
				return;
			}
		}
		
		log(`Computer player ${computerId} found no valid chess moves`);
	}
	
	/**
	 * Generate possible chess moves for a piece
	 * @param {Object} game - The game object
	 * @param {Object} piece - The chess piece
	 * @returns {Array} Array of possible moves
	 * @private
	 */
	_generatePossibleMoves(game, piece) {
		const pos = piece.position || piece;
		if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return [];
		
		const x = pos.x;
		const z = pos.z;
		const type = String(piece.type || '').toLowerCase();
		const possibleMoves = [];
		const MAX_RANGE = 20;
		
		const hasBoardCell = (tx, tz) => {
			const cell = game.board.cells[`${tx},${tz}`];
			return !!(cell && Array.isArray(cell) && cell.length > 0);
		};
		
		const tryTarget = (tx, tz) => {
			if (!hasBoardCell(tx, tz)) return;
			// Avoid landing on own chess pieces
			const targetPiece = (game.chessPieces || []).find(
				p => p && (p.position || p).x === tx && (p.position || p).z === tz
			);
			if (targetPiece && targetPiece.player === piece.player) return;
			possibleMoves.push({ x: tx, z: tz });
		};
		
		if (type === 'king') {
			for (let dx = -1; dx <= 1; dx++) {
				for (let dz = -1; dz <= 1; dz++) {
					if (dx === 0 && dz === 0) continue;
					tryTarget(x + dx, z + dz);
				}
			}
		} else if (type === 'knight') {
			const knightMoves = [
				[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]
			];
			for (const [dx, dz] of knightMoves) tryTarget(x + dx, z + dz);
		} else if (type === 'pawn') {
			const orientation = Number.isFinite(piece.orientation) ? piece.orientation : 0;
			const forward = [
				{ dx: 0, dz: 1 }, { dx: 1, dz: 0 },
				{ dx: 0, dz: -1 }, { dx: -1, dz: 0 }
			][orientation] || { dx: 0, dz: 1 };
			
			// Forward one
			tryTarget(x + forward.dx, z + forward.dz);
			// Forward two (first move)
			if (!piece.hasMoved) tryTarget(x + forward.dx * 2, z + forward.dz * 2);
			// Diagonal captures
			if (forward.dx === 0) {
				tryTarget(x - 1, z + forward.dz);
				tryTarget(x + 1, z + forward.dz);
			} else {
				tryTarget(x + forward.dx, z - 1);
				tryTarget(x + forward.dx, z + 1);
			}
		} else {
			// Sliding pieces (rook, bishop, queen)
			const directions = [];
			if (type === 'rook' || type === 'queen') {
				directions.push([1,0],[-1,0],[0,1],[0,-1]);
			}
			if (type === 'bishop' || type === 'queen') {
				directions.push([1,1],[1,-1],[-1,1],[-1,-1]);
			}
			for (const [dx, dz] of directions) {
				for (let step = 1; step <= MAX_RANGE; step++) {
					const tx = x + dx * step;
					const tz = z + dz * step;
					if (!hasBoardCell(tx, tz)) break;
					const blocker = (game.chessPieces || []).find(
						p => p && (p.position || p).x === tx && (p.position || p).z === tz
					);
					if (blocker) {
						if (blocker.player !== piece.player) possibleMoves.push({ x: tx, z: tz });
						break;
					}
					possibleMoves.push({ x: tx, z: tz });
				}
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
		
		const pieceTypes = ['pawn', 'rook', 'knight', 'bishop', 'queen'];
		const pieceType = this._getWeightedPieceType(pieceTypes, player.balance, computerPlayer.difficulty);
		
		// Try positions near own cells on the sparse board
		const ownCellKeys = Object.keys(game.board.cells).filter(key => {
			const cell = game.board.cells[key];
			return Array.isArray(cell) && cell.some(item => item && item.player === computerId);
		});
		
		for (let attempt = 0; attempt < 20; attempt++) {
			let x, z;
			if (ownCellKeys.length > 0) {
				const randomKey = ownCellKeys[Math.floor(Math.random() * ownCellKeys.length)];
				const [cx, cz] = randomKey.split(',').map(Number);
				x = cx + Math.floor(Math.random() * 5) - 2;
				z = cz + Math.floor(Math.random() * 5) - 2;
			} else {
				const homeZone = game.homeZones[computerId];
				x = (homeZone ? homeZone.x : 0) + Math.floor(Math.random() * 8);
				z = (homeZone ? homeZone.z : 0) + Math.floor(Math.random() * 4);
			}
			
			const action = {
				type: 'purchase',
				data: { pieceType, x, z }
			};
			
			const result = this.playerManager.handlePlayerAction(game, computerId, action);
			if (result.success) {
				log(`Computer player ${computerId} purchased ${pieceType} at (${x}, ${z})`);
				return;
			}
		}
		
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
		
		const affordablePieces = pieceTypes.filter(type => {
			const price = PIECE_PRICES[type.toUpperCase()] || PIECE_PRICES[type];
			return price !== undefined && price <= balance;
		});
		
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