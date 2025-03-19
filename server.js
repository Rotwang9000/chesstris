/**
 * Shaktris Game Server
 * 
 * This server handles serving the game files and managing multiplayer functionality.
 */

// Import required modules
const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

// Import API routes
const apiRoutes = require('./routes/api');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Set port from environment variable or default to 3020
const PORT = process.env.PORT || 3020;

// Game state storage
const games = new Map();
const players = new Map();
const spectators = new Map(); // Map of spectator socket IDs to player IDs they're spectating
const computerPlayers = new Map(); // Map of computer player IDs to their game data

// Computer player difficulty levels
const COMPUTER_DIFFICULTY = {
	EASY: 'easy',
	MEDIUM: 'medium',
	HARD: 'hard'
};

// Minimum time between computer player moves (in milliseconds)
const MIN_COMPUTER_MOVE_TIME = 10000; // 10 seconds minimum as per requirements

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Environment detection
const isDevelopment = process.env.NODE_ENV !== 'production';

// In development mode (localhost), serve files from the public directory directly
app.use(express.static(path.join(__dirname, 'public')));

// In production, serve the React app from build directory
if (!isDevelopment) {
	app.use(express.static(path.join(__dirname, 'client/build')));
} 

// API routes
app.use('/api', apiRoutes);

// Route for 2D mode
app.get('/2d', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all route that will serve the React app in production, but public/index.html in development
app.get('*', (req, res) => {
	if (isDevelopment) {
		res.sendFile(path.join(__dirname, 'public', 'index.html'));
	} else {
		res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
	}
});

// Socket.IO connection handling
io.on('connection', (socket) => {
	console.log(`Player connected: ${socket.id}`);
	
	// Store player information
	const playerId = socket.id;
	players.set(playerId, {
		id: playerId,
		name: `Player_${playerId.substring(0, 5)}`,
		gameId: null,
		socket: socket
	});
	
	// Send player ID to client
	socket.emit('player_id', playerId);
	
	// Handle player joining a game
	socket.on('join_game', (gameId, playerName, callback) => {
		try {
			const player = players.get(playerId);
			
			// Update player name if provided
			if (playerName) {
				player.name = playerName;
			}
			
			// If no game ID provided, create a new game
			if (!gameId) {
				gameId = createNewGame();
			}
			
			// Check if game exists
			if (!games.has(gameId)) {
				if (callback) callback({ success: false, error: 'Game not found' });
				return;
			}
			
			const game = games.get(gameId);
			
			// Check if game is full
			if (game.players.length >= game.maxPlayers) {
				if (callback) callback({ success: false, error: 'Game is full' });
				return;
			}
			
			// Add player to game
			game.players.push(playerId);
			player.gameId = gameId;
			
			// Join socket room for this game
			socket.join(gameId);
			
			// Notify all players in the game
			io.to(gameId).emit('player_joined', {
				playerId: playerId,
				playerName: player.name,
				gameId: gameId,
				players: game.players.map(id => ({
					id: id,
					name: players.get(id) ? players.get(id).name : `Player_${id.substring(0, 5)}`,
					isComputer: computerPlayers.has(id)
				}))
			});
			
			// Send game state to the new player
			socket.emit('game_update', game.state);
			
			if (callback) callback({ success: true, gameId: gameId });
			
			console.log(`Player ${playerId} joined game ${gameId}`);
		} catch (error) {
			console.error('Error joining game:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});
	
	// Handle player creating a game
	socket.on('create_game', (settings, callback) => {
		try {
			const gameId = createNewGame(settings);
			if (callback) callback({ success: true, gameId: gameId });
		} catch (error) {
			console.error('Error creating game:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});
	
	// Handle tetromino placement
	socket.on('tetromino_placed', (data) => {
		const player = players.get(playerId);
		if (!player || !player.gameId) return;
		
		const game = games.get(player.gameId);
		if (!game) return;
		
		// Update game state
		game.state.board = data.board;
		game.state.lastAction = {
			type: 'tetromino_placed',
			playerId: playerId,
			data: data
		};
		
		// Broadcast to all players in the game except sender
		socket.to(player.gameId).emit('tetromino_placed', {
			playerId: playerId,
			...data
		});
		
		// Send update to spectators
		updateSpectators(playerId, game.state);
	});
	
	// Handle chess piece movement
	socket.on('chess_move', (data) => {
		const player = players.get(playerId);
		if (!player || !player.gameId) return;
		
		const game = games.get(player.gameId);
		if (!game) return;
		
		// Update game state
		game.state.chessPieces = data.chessPieces;
		game.state.lastAction = {
			type: 'chess_move',
			playerId: playerId,
			data: data
		};
		
		// Broadcast to all players in the game except sender
		socket.to(player.gameId).emit('chess_move', {
			playerId: playerId,
			...data
		});
		
		// Send update to spectators
		updateSpectators(playerId, game.state);
		
		// Check for game over (king captured)
		if (data.captured && data.captured.type === 'king') {
			endGame(player.gameId, {
				winner: playerId,
				reason: 'king_captured'
			});
		}
	});
	
	// Handle game state update
	socket.on('game_update', (data) => {
		const player = players.get(playerId);
		if (!player || !player.gameId) return;
		
		const game = games.get(player.gameId);
		if (!game) return;
		
		// Update game state
		Object.assign(game.state, data);
		
		// Broadcast to all players in the game except sender
		socket.to(player.gameId).emit('game_update', data);
		
		// Send update to spectators
		updateSpectators(playerId, game.state);
	});
	
	// Handle spectator requests
	socket.on('request_spectate', (data) => {
		if (!data || !data.playerId) return;
		
		const targetPlayerId = data.playerId;
		const targetPlayer = players.get(targetPlayerId) || computerPlayers.get(targetPlayerId);
		
		if (!targetPlayer) {
			socket.emit('error', { message: 'Player not found' });
			return;
		}
		
		// Register as spectator
		spectators.set(playerId, targetPlayerId);
		
		// Get game state
		const gameId = targetPlayer.gameId;
		if (gameId && games.has(gameId)) {
			const game = games.get(gameId);
			
			// Send current game state to spectator
			socket.emit('spectator_update', {
				playerId: targetPlayerId,
				gameState: game.state
			});
			
			console.log(`Player ${playerId} is now spectating ${targetPlayerId}`);
		}
	});
	
	// Handle stop spectating
	socket.on('stop_spectating', () => {
		if (spectators.has(playerId)) {
			spectators.delete(playerId);
			console.log(`Player ${playerId} stopped spectating`);
		}
	});
	
	// Handle request for game state
	socket.on('request_game_state', (data) => {
		if (!data || !data.playerId) return;
		
		const targetPlayerId = data.playerId;
		const targetPlayer = players.get(targetPlayerId) || computerPlayers.get(targetPlayerId);
		
		if (!targetPlayer) {
			socket.emit('error', { message: 'Player not found' });
			return;
		}
		
		// Get game state
		const gameId = targetPlayer.gameId;
		if (gameId && games.has(gameId)) {
			const game = games.get(gameId);
			
			// Send current game state
			socket.emit('game_update', game.state);
		}
	});
	
	// Handle player leaving
	socket.on('disconnect', () => {
		console.log(`Player disconnected: ${playerId}`);
		
		// Remove from spectators if spectating
		if (spectators.has(playerId)) {
			spectators.delete(playerId);
		}
		
		const player = players.get(playerId);
		if (player && player.gameId) {
			const gameId = player.gameId;
			const game = games.get(gameId);
			
			if (game) {
				// Remove player from game
				game.players = game.players.filter(id => id !== playerId);
				
				// Notify remaining players
				io.to(gameId).emit('player_left', {
					playerId: playerId,
					gameId: gameId,
					players: game.players.map(id => ({
						id: id,
						name: players.get(id) ? players.get(id).name : `Player_${id.substring(0, 5)}`,
						isComputer: computerPlayers.has(id)
					}))
				});
				
				// If no players left, remove the game
				if (game.players.length === 0) {
					games.delete(gameId);
					console.log(`Game ${gameId} removed (no players left)`);
				}
			}
		}
		
		// Remove player from players map
		players.delete(playerId);
	});
});

// Create a new game
function createNewGame(settings = {}) {
	const gameId = uuidv4();
	
	games.set(gameId, {
		id: gameId,
		players: [],
		maxPlayers: settings.maxPlayers || 2048,
		hasComputerPlayer: false,
		state: {
			board: [],
			chessPieces: [],
			gameMode: settings.gameMode || 'standard',
			difficulty: settings.difficulty || 'normal',
			startLevel: settings.startLevel || 1,
			boardSize: settings.boardSize || { width: 10, height: 20 },
			renderMode: settings.renderMode || '3d',
			status: 'waiting'
		},
		created: Date.now()
	});
	
	console.log(`New game created: ${gameId}`);
	
	// Always add a computer player to each game
	addComputerPlayer(gameId);
	
	return gameId;
}

// End a game
function endGame(gameId, result) {
	const game = games.get(gameId);
	if (!game) return;
	
	// Update game state
	game.state.status = 'game_over';
	game.state.result = result;
	
	// Notify all players
	io.to(gameId).emit('game_over', result);
	
	console.log(`Game ${gameId} ended. Winner: ${result.winner}`);
}

/**
 * Add a computer player to the game
 * @param {string} gameId - The game ID
 * @param {string} difficulty - Computer difficulty (easy, medium, hard)
 * @returns {string} Computer player ID
 */
function addComputerPlayer(gameId, difficulty = COMPUTER_DIFFICULTY.MEDIUM) {
	const game = games.get(gameId);
	if (!game) return null;
	
	// Create computer player ID
	const computerId = `computer-${uuidv4().substring(0, 8)}`;
	
	// Validate difficulty
	const validDifficulty = Object.values(COMPUTER_DIFFICULTY).includes(difficulty)
		? difficulty
		: COMPUTER_DIFFICULTY.MEDIUM;
	
	// Determine move interval based on difficulty
	let minMoveInterval;
	switch (validDifficulty) {
		case COMPUTER_DIFFICULTY.EASY:
			minMoveInterval = 15000; // 15 seconds for easy opponents
			break;
		case COMPUTER_DIFFICULTY.MEDIUM:
			minMoveInterval = 10000; // 10 seconds for medium opponents
			break;
		case COMPUTER_DIFFICULTY.HARD:
			minMoveInterval = 5000;  // 5 seconds for hard opponents
			break;
		default:
			minMoveInterval = 10000;
	}
	
	// Add computer player to the game
	computerPlayers.set(computerId, {
		id: computerId,
		name: `Computer_${computerId.substring(9, 13)}`,
		gameId: gameId,
		isComputer: true,
		difficulty: validDifficulty,
		lastMoveTime: 0,
		consecutiveMoves: 0,
		minMoveInterval: minMoveInterval,
		strategy: generateComputerStrategy(validDifficulty)
	});
	
	game.players.push(computerId);
	game.hasComputerPlayer = true;
	
	// Notify all players in the game
	io.to(gameId).emit('player_joined', {
		playerId: computerId,
		playerName: `Computer_${computerId.substring(9, 13)}`,
		gameId: gameId,
		isComputer: true,
		difficulty: validDifficulty,
		players: game.players.map(id => ({
			id: id,
			name: players.get(id) ? players.get(id).name : (
				computerPlayers.get(id) ? computerPlayers.get(id).name : `Player_${id.substring(0, 5)}`
			),
			isComputer: computerPlayers.has(id),
			difficulty: computerPlayers.get(id)?.difficulty
		}))
	});
	
	console.log(`Computer player ${computerId} (${validDifficulty}) added to game ${gameId}`);
	
	// Start computer player actions
	startComputerPlayerActions(computerId, gameId);
	
	return computerId;
}

/**
 * Generate a strategy for the computer player based on difficulty
 * @param {string} difficulty - The difficulty level
 * @returns {Object} Strategy object
 */
function generateComputerStrategy(difficulty) {
	switch(difficulty) {
		case COMPUTER_DIFFICULTY.EASY:
			return {
				aggressiveness: 0.2, // Low chance to attack
				defensiveness: 0.7, // High chance to defend
				buildSpeed: 0.3,    // Slow build rate
				kingProtection: 0.8, // High king protection
				explorationRate: 0.4 // Medium exploration rate
			};
		case COMPUTER_DIFFICULTY.HARD:
			return {
				aggressiveness: 0.8, // High chance to attack
				defensiveness: 0.4, // Medium chance to defend
				buildSpeed: 0.8,    // Fast build rate
				kingProtection: 0.6, // Medium king protection
				explorationRate: 0.7 // High exploration rate
			};
		case COMPUTER_DIFFICULTY.MEDIUM:
		default:
			return {
				aggressiveness: 0.5, // Medium chance to attack
				defensiveness: 0.5, // Medium chance to defend
				buildSpeed: 0.5,    // Medium build rate
				kingProtection: 0.7, // Medium-high king protection
				explorationRate: 0.5 // Medium exploration rate
			};
	}
}

// Start computer player actions
function startComputerPlayerActions(computerId, gameId) {
	const game = games.get(gameId);
	if (!game) return;
	
	const computerPlayer = computerPlayers.get(computerId);
	if (!computerPlayer) return;
	
	// Set up interval for computer player actions
	const actionInterval = setInterval(() => {
		// Check if game still exists and computer player is still in the game
		if (!games.has(gameId) || !game.players.includes(computerId)) {
			clearInterval(actionInterval);
			return;
		}
		
		const now = Date.now();
		
		// Enforce minimum time between moves
		if (now - computerPlayer.lastMoveTime < computerPlayer.minMoveInterval) {
			return;
		}
		
		// Perform strategic actions based on difficulty and game state
		performComputerAction(computerId, gameId);
		
		// Update last move time
		computerPlayer.lastMoveTime = now;
		computerPlayer.consecutiveMoves++;
	}, 1000); // Check every second, but enforce minimum time between actual moves
}

// Perform a strategic computer action
function performComputerAction(computerId, gameId) {
	const game = games.get(gameId);
	if (!game) return;
	
	const computerPlayer = computerPlayers.get(computerId);
	if (!computerPlayer) return;
	
	const strategy = computerPlayer.strategy;
	const gameState = game.state || {};
	
	// Determine action type based on player's situation and strategy
	let actionType;
	
	// If computer has pieces under threat, prioritize defense based on defensiveness
	const hasThreatenedPieces = checkForThreatenedPieces(gameState, computerId);
	
	if (hasThreatenedPieces && Math.random() < strategy.defensiveness) {
		actionType = 'chess'; // Defend with chess move
	} 
	// If king is exposed, prioritize protection based on king protection value
	else if (isKingExposed(gameState, computerId) && Math.random() < strategy.kingProtection) {
		actionType = 'tetromino'; // Build protection with tetromino
	}
	// If there's an opportunity to attack based on aggressiveness
	else if (hasAttackOpportunity(gameState, computerId) && Math.random() < strategy.aggressiveness) {
		actionType = 'chess'; // Attack with chess move
	}
	// Otherwise, decide based on build speed and exploration
	else {
		actionType = Math.random() < strategy.buildSpeed ? 'tetromino' : 'chess';
	}
	
	if (actionType === 'tetromino') {
		performStrategicTetrominoPlacement(gameState, computerId, strategy);
	} else {
		performStrategicChessMove(gameState, computerId, strategy);
	}
}

/**
 * Check if any of the computer's pieces are under threat
 * @param {Object} gameState - Current game state
 * @param {string} computerId - Computer player ID
 * @returns {boolean} True if any pieces are threatened
 */
function checkForThreatenedPieces(gameState, computerId) {
	// Implementation would check if opponent pieces can capture in the next move
	// Simplified version for now
	return Math.random() < 0.3; // 30% chance to detect threatened pieces
}

/**
 * Check if the computer's king is exposed
 * @param {Object} gameState - Current game state
 * @param {string} computerId - Computer player ID
 * @returns {boolean} True if king is exposed
 */
function isKingExposed(gameState, computerId) {
	// Implementation would check king's position and surrounding protection
	// Simplified version for now
	return Math.random() < 0.2; // 20% chance to detect exposed king
}

/**
 * Check if there's an opportunity to attack opponent pieces
 * @param {Object} gameState - Current game state
 * @param {string} computerId - Computer player ID
 * @returns {boolean} True if attack opportunity exists
 */
function hasAttackOpportunity(gameState, computerId) {
	// Implementation would check if computer pieces can capture opponent pieces
	// Simplified version for now
	return Math.random() < 0.4; // 40% chance to detect attack opportunity
}

/**
 * Perform a strategic tetromino placement based on game state and strategy
 * @param {Object} gameState - Current game state
 * @param {string} computerId - Computer player ID
 * @param {Object} strategy - Computer player strategy
 */
function performStrategicTetrominoPlacement(gameState, computerId, strategy) {
	const game = games.get(computerPlayers.get(computerId).gameId);
	if (!game) return;
	
	// Get the current board state
	const board = gameState.board || [];
	
	// Find the best placement for a tetromino based on current situation
	// This would involve analyzing the board to find optimal placement
	// For now, we'll use an improved simulation
	
	// Generate a tetromino shape
	const tetrominoShapes = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
	const shape = tetrominoShapes[Math.floor(Math.random() * tetrominoShapes.length)];
	
	// Find a valid placement that connects to existing pieces
	// For now, using enhanced simulation
	const updatedBoard = simulateTetrominoPlacement(board, computerId, strategy);
	
	// Update game state
	game.state.board = updatedBoard;
	game.state.lastAction = {
		type: 'tetromino_placed',
		playerId: computerId,
		data: { board: updatedBoard }
	};
	
	// Broadcast to all players in the game
	io.to(game.id).emit('tetromino_placed', {
		playerId: computerId,
		board: updatedBoard
	});
	
	// Send update to spectators
	updateSpectators(computerId, game.state);
}

/**
 * Perform a strategic chess move based on game state and strategy
 * @param {Object} gameState - Current game state
 * @param {string} computerId - Computer player ID
 * @param {Object} strategy - Computer player strategy
 */
function performStrategicChessMove(gameState, computerId, strategy) {
	const game = games.get(computerPlayers.get(computerId).gameId);
	if (!game) return;
	
	// Get the current chess pieces
	const chessPieces = gameState.chessPieces || [];
	
	// Find the best move based on strategy and game state
	// This would involve analyzing threats, opportunities, etc.
	// For now, using enhanced simulation
	
	// Create an improved chess move
	const updatedChessPieces = simulateChessMove(chessPieces, computerId, strategy);
	
	// Update game state
	game.state.chessPieces = updatedChessPieces;
	game.state.lastAction = {
		type: 'chess_move',
		playerId: computerId,
		data: { chessPieces: updatedChessPieces }
	};
	
	// Broadcast to all players in the game
	io.to(game.id).emit('chess_move', {
		playerId: computerId,
		chessPieces: updatedChessPieces
	});
	
	// Send update to spectators
	updateSpectators(computerId, game.state);
}

// Simulate tetromino placement with enhanced strategy
function simulateTetrominoPlacement(board, computerId, strategy) {
	// Create a copy of the board
	const newBoard = Array.isArray(board) ? JSON.parse(JSON.stringify(board)) : [];
	
	// Ensure board has at least some rows and columns
	if (newBoard.length === 0) {
		for (let y = 0; y < 20; y++) {
			newBoard[y] = [];
			for (let x = 0; x < 10; x++) {
				newBoard[y][x] = 0;
			}
		}
	}
	
	// Get tetromino type based on strategy
	// More aggressive strategies prefer I and L pieces for reach
	// More defensive strategies prefer O and T pieces for stability
	let tetrominoType;
	if (Math.random() < strategy.aggressiveness) {
		tetrominoType = Math.random() < 0.5 ? 1 : 3; // I or L shapes
	} else if (Math.random() < strategy.defensiveness) {
		tetrominoType = Math.random() < 0.5 ? 4 : 6; // O or T shapes
	} else {
		tetrominoType = Math.floor(Math.random() * 7) + 1; // 1-7 for all pieces
	}
	
	// Calculate placement based on strategy
	// Higher exploration rates place pieces further from current structures
	// Higher build speeds prioritize building upward
	let x, y;
	
	if (Math.random() < strategy.explorationRate) {
		// Place further out
		x = Math.floor(Math.random() * (newBoard[0].length - 3));
		y = Math.floor(Math.random() * (newBoard.length - 3));
	} else {
		// Place near existing structures (simplified)
		// In a real implementation, would analyze the board to find existing structures
		x = Math.floor(Math.random() * (newBoard[0].length / 2)) + Math.floor(newBoard[0].length / 4);
		y = Math.floor(Math.random() * (newBoard.length / 2)) + Math.floor(newBoard.length / 4);
	}
	
	// Place the tetromino
	// This would be improved by using actual tetromino shapes
	// For now, place a shape based on the tetromino type
	switch (tetrominoType) {
		case 1: // I shape
			for (let i = 0; i < 4; i++) {
				if (y + i < newBoard.length) {
					newBoard[y + i][x] = tetrominoType;
				}
			}
			break;
		case 2: // J shape
			for (let i = 0; i < 3; i++) {
				if (y + i < newBoard.length) {
					newBoard[y + i][x] = tetrominoType;
				}
			}
			if (x + 1 < newBoard[0].length && y + 2 < newBoard.length) {
				newBoard[y + 2][x + 1] = tetrominoType;
			}
			break;
		case 3: // L shape
			for (let i = 0; i < 3; i++) {
				if (y + i < newBoard.length) {
					newBoard[y + i][x] = tetrominoType;
				}
			}
			if (x + 1 < newBoard[0].length && y < newBoard.length) {
				newBoard[y][x + 1] = tetrominoType;
			}
			break;
		case 4: // O shape
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					if (y + i < newBoard.length && x + j < newBoard[0].length) {
						newBoard[y + i][x + j] = tetrominoType;
					}
				}
			}
			break;
		default: // Other shapes (simplified)
			for (let i = 0; i < 3; i++) {
				for (let j = 0; j < 2; j++) {
					if (y + i < newBoard.length && x + j < newBoard[0].length && Math.random() < 0.7) {
						newBoard[y + i][x + j] = tetrominoType;
					}
				}
			}
	}
	
	return newBoard;
}

// Simulate chess move with enhanced strategy
function simulateChessMove(chessPieces, computerId, strategy) {
	// Create a copy of the chess pieces
	const newChessPieces = Array.isArray(chessPieces) ? JSON.parse(JSON.stringify(chessPieces)) : [];
	
	// If no pieces, create some
	if (newChessPieces.length === 0) {
		// Add a few basic pieces
		newChessPieces.push({
			id: `${computerId}-king`,
			type: 'king',
			player: 2, // Computer is usually black
			position: { x: 4, y: 0 }
		});
		
		newChessPieces.push({
			id: `${computerId}-queen`,
			type: 'queen',
			player: 2,
			position: { x: 3, y: 0 }
		});
		
		newChessPieces.push({
			id: `${computerId}-pawn1`,
			type: 'pawn',
			player: 2,
			position: { x: 0, y: 1 }
		});
		
		newChessPieces.push({
			id: `${computerId}-pawn2`,
			type: 'pawn',
			player: 2,
			position: { x: 1, y: 1 }
		});
		
		return newChessPieces;
	}
	
	// Find all pieces belonging to the computer player
	const computerPieces = newChessPieces.filter(piece => piece.player === 2);
	
	if (computerPieces.length === 0) {
		return newChessPieces;
	}
	
	// Strategy-based piece selection
	let pieceIndex;
	let piece;
	
	if (Math.random() < strategy.kingProtection) {
		// Find the king if king protection is high priority
		const king = computerPieces.find(p => p.type === 'king');
		if (king) {
			piece = king;
		} else {
			pieceIndex = Math.floor(Math.random() * computerPieces.length);
			piece = computerPieces[pieceIndex];
		}
	} else if (Math.random() < strategy.aggressiveness) {
		// Find aggressive pieces if aggressiveness is high
		const aggressivePieces = computerPieces.filter(p => ['queen', 'rook', 'bishop'].includes(p.type));
		if (aggressivePieces.length > 0) {
			pieceIndex = Math.floor(Math.random() * aggressivePieces.length);
			piece = aggressivePieces[pieceIndex];
		} else {
			pieceIndex = Math.floor(Math.random() * computerPieces.length);
			piece = computerPieces[pieceIndex];
		}
	} else {
		// Random piece selection
		pieceIndex = Math.floor(Math.random() * computerPieces.length);
		piece = computerPieces[pieceIndex];
	}
	
	// Find the piece in the original array
	const originalPieceIndex = newChessPieces.findIndex(p => p.id === piece.id);
	
	if (originalPieceIndex !== -1) {
		// Movement based on piece type and strategy
		let dx = 0;
		let dy = 0;
		
		switch (piece.type) {
			case 'king':
				// Kings move 1 square in any direction
				dx = Math.floor(Math.random() * 3) - 1;
				dy = Math.floor(Math.random() * 3) - 1;
				break;
			case 'queen':
				// Queens can move in any direction, multiple squares
				if (Math.random() < 0.5) {
					// Diagonal
					dx = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
					dy = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
				} else {
					// Straight
					if (Math.random() < 0.5) {
						dx = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
						dy = 0;
					} else {
						dx = 0;
						dy = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
					}
				}
				break;
			case 'rook':
				// Rooks move in straight lines
				if (Math.random() < 0.5) {
					dx = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
					dy = 0;
				} else {
					dx = 0;
					dy = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
				}
				break;
			case 'bishop':
				// Bishops move diagonally
				dx = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
				dy = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
				break;
			case 'knight':
				// Knights move in L-shape
				if (Math.random() < 0.5) {
					dx = (Math.random() < 0.5 ? 1 : -1) * 2;
					dy = (Math.random() < 0.5 ? 1 : -1) * 1;
				} else {
					dx = (Math.random() < 0.5 ? 1 : -1) * 1;
					dy = (Math.random() < 0.5 ? 1 : -1) * 2;
				}
				break;
			case 'pawn':
				// Pawns move forward 1 or 2 squares and capture diagonally
				if (Math.random() < strategy.aggressiveness) {
					// Try to capture (diagonal move)
					dx = (Math.random() < 0.5 ? 1 : -1);
					dy = 1;
				} else {
					// Move forward
					dx = 0;
					dy = Math.random() < 0.2 ? 2 : 1; // 20% chance for 2-square move
				}
				break;
			default:
				// Default movement
				dx = Math.floor(Math.random() * 3) - 1;
				dy = Math.floor(Math.random() * 3) - 1;
		}
		
		// Apply movement based on strategy
		if (Math.random() < strategy.explorationRate) {
			// More exploratory moves - increase movement distance
			dx = dx * 1.5;
			dy = dy * 1.5;
		}
		
		// Update position
		newChessPieces[originalPieceIndex].position.x += Math.round(dx);
		newChessPieces[originalPieceIndex].position.y += Math.round(dy);
		
		// Ensure position is within bounds
		newChessPieces[originalPieceIndex].position.x = Math.max(0, Math.min(7, newChessPieces[originalPieceIndex].position.x));
		newChessPieces[originalPieceIndex].position.y = Math.max(0, Math.min(7, newChessPieces[originalPieceIndex].position.y));
	}
	
	return newChessPieces;
}

// Update spectators with new game state
function updateSpectators(playerId, gameState) {
	// Find all spectators watching this player
	for (const [spectatorId, targetId] of spectators.entries()) {
		if (targetId === playerId) {
			const spectatorSocket = players.get(spectatorId)?.socket;
			if (spectatorSocket) {
				spectatorSocket.emit('spectator_update', {
					playerId: playerId,
					gameState: gameState
				});
			}
		}
	}
}

// Start the server
server.listen(PORT, () => {
	console.log(`Shaktris server running on port ${PORT}`);
	console.log(`- Game: http://localhost:${PORT}/`);
	console.log(`- 2D Mode: http://localhost:${PORT}/2d`);
	console.log(`- API: http://localhost:${PORT}/api`);
});
