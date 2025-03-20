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

// Default global game ID
const GLOBAL_GAME_ID = 'global_game';

// Computer player difficulty levels
const COMPUTER_DIFFICULTY = {
	EASY: 'easy',
	MEDIUM: 'medium',
	HARD: 'hard'
};

// Minimum time between computer player moves (in milliseconds)
const MIN_COMPUTER_MOVE_TIME = 10000; // 10 seconds minimum as per requirements

// Initialize global game on startup
initializeGlobalGame();

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
			
			// If no game ID provided or null, use the global game
			if (!gameId) {
				gameId = GLOBAL_GAME_ID;
				console.log(`Player ${playerId} joining global game`);
			}
			
			// Check if game exists
			if (!games.has(gameId)) {
				console.log(`Game ${gameId} not found, redirecting to global game`);
				gameId = GLOBAL_GAME_ID;
				
				// If global game doesn't exist for some reason, create it
				if (!games.has(GLOBAL_GAME_ID)) {
					initializeGlobalGame();
				}
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
	
	// Handle get_game_state request
	socket.on('get_game_state', (data) => {
		try {
			console.log(`Player ${playerId} requested game state`, data);
			
			const player = players.get(playerId);
			if (!player) {
				socket.emit('error', { message: 'Player not found' });
				return;
			}
			
			// If player is not in a game, try to join the global game first
			if (!player.gameId) {
				console.log(`Player ${playerId} not in a game, joining global game first`);
				
				// Ensure global game exists
				if (!games.has(GLOBAL_GAME_ID)) {
					initializeGlobalGame();
				}
				
				// Add player to global game
				const globalGame = games.get(GLOBAL_GAME_ID);
				globalGame.players.push(playerId);
				player.gameId = GLOBAL_GAME_ID;
				
				// Join socket room for global game
				socket.join(GLOBAL_GAME_ID);
				
				console.log(`Player ${playerId} automatically joined global game`);
			}
			
			const gameId = player.gameId;
			const game = games.get(gameId);
			
			if (!game) {
				console.error(`Game ${gameId} not found for player ${playerId}`);
				
				// Try to recover by joining global game
				if (gameId !== GLOBAL_GAME_ID) {
					// Ensure global game exists
					if (!games.has(GLOBAL_GAME_ID)) {
						initializeGlobalGame();
					}
					
					const globalGame = games.get(GLOBAL_GAME_ID);
					player.gameId = GLOBAL_GAME_ID;
					socket.join(GLOBAL_GAME_ID);
					
					// Send global game state
					socket.emit('game_state', {
						gameId: GLOBAL_GAME_ID,
						state: globalGame.state,
						players: globalGame.players.map(id => ({
							id: id,
							name: players.get(id) ? players.get(id).name : `Player_${id.substring(0, 5)}`,
							isComputer: computerPlayers.has(id)
						}))
					});
					
					console.log(`Redirected player ${playerId} to global game after error`);
					return;
				}
				
				socket.emit('error', { message: 'Game not found and unable to recover' });
				return;
			}
			
			// Send full game state to the requesting client
			socket.emit('game_state', {
				gameId: gameId,
				state: game.state,
				players: game.players.map(id => ({
					id: id,
					name: players.get(id) ? players.get(id).name : `Player_${id.substring(0, 5)}`,
					isComputer: computerPlayers.has(id)
				}))
			});
			
			console.log(`Sent game state to player ${playerId}`);
		} catch (error) {
			console.error('Error handling get_game_state request:', error);
			socket.emit('error', { message: 'Error getting game state' });
		}
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
	
	// Handle restart game request
	socket.on('restart_game', (data) => {
		try {
			console.log(`Player ${playerId} requested game restart`, data);
			
			const player = players.get(playerId);
			if (!player || !player.gameId) {
				socket.emit('error', { message: 'Not in a game' });
				return;
			}
			
			const gameId = player.gameId;
			const game = games.get(gameId);
			
			if (!game) {
				socket.emit('error', { message: 'Game not found' });
				return;
			}
			
			// Create a fresh game state but keep the same game ID
			const boardSize = game.state.boardSize || 16;
			
			// Create empty board
			const board = Array(boardSize).fill().map(() => Array(boardSize).fill(0));
			
			// Set up home zones
			// Player 1 (blue) - bottom
			for (let z = boardSize - 2; z < boardSize; z++) {
				for (let x = 0; x < 8; x++) {
					board[z][x] = 6; // Blue home zone
				}
			}
			
			// Player 2 (orange) - top
			for (let z = 0; z < 2; z++) {
				for (let x = 8; x < boardSize; x++) {
					board[z][x] = 7; // Orange home zone
				}
			}
			
			// Initialize chess pieces
			// Define chess piece types and positions for player 1
			const player1Pieces = [
				{ type: 'pawn', x: 0, z: 14 },
				{ type: 'pawn', x: 1, z: 14 },
				{ type: 'pawn', x: 2, z: 14 },
				{ type: 'pawn', x: 3, z: 14 },
				{ type: 'pawn', x: 4, z: 14 },
				{ type: 'pawn', x: 5, z: 14 },
				{ type: 'pawn', x: 6, z: 14 },
				{ type: 'pawn', x: 7, z: 14 },
				{ type: 'rook', x: 0, z: 15 },
				{ type: 'knight', x: 1, z: 15 },
				{ type: 'bishop', x: 2, z: 15 },
				{ type: 'queen', x: 3, z: 15 },
				{ type: 'king', x: 4, z: 15 },
				{ type: 'bishop', x: 5, z: 15 },
				{ type: 'knight', x: 6, z: 15 },
				{ type: 'rook', x: 7, z: 15 }
			].map(piece => ({ ...piece, player: 1 }));
			
			// Define chess piece types and positions for player 2
			const player2Pieces = [
				{ type: 'pawn', x: 8, z: 1 },
				{ type: 'pawn', x: 9, z: 1 },
				{ type: 'pawn', x: 10, z: 1 },
				{ type: 'pawn', x: 11, z: 1 },
				{ type: 'pawn', x: 12, z: 1 },
				{ type: 'pawn', x: 13, z: 1 },
				{ type: 'pawn', x: 14, z: 1 },
				{ type: 'pawn', x: 15, z: 1 },
				{ type: 'rook', x: 8, z: 0 },
				{ type: 'knight', x: 9, z: 0 },
				{ type: 'bishop', x: 10, z: 0 },
				{ type: 'queen', x: 11, z: 0 },
				{ type: 'king', x: 12, z: 0 },
				{ type: 'bishop', x: 13, z: 0 },
				{ type: 'knight', x: 14, z: 0 },
				{ type: 'rook', x: 15, z: 0 }
			].map(piece => ({ ...piece, player: 2 }));
			
			// Combine all chess pieces
			const chessPieces = [...player1Pieces, ...player2Pieces];
			
			// Update the game state
			game.state = {
				...game.state,
				board: board,
				chessPieces: chessPieces,
				currentPlayer: 1,
				turnPhase: 'tetris',
				status: 'playing',
				startTime: Date.now()
			};
			
			// Broadcast the new game state to all players in the game
			io.to(gameId).emit('game_state', {
				gameId: gameId,
				state: game.state,
				players: game.players.map(id => ({
					id: id,
					name: players.get(id) ? players.get(id).name : `Player_${id.substring(0, 5)}`,
					isComputer: computerPlayers.has(id)
				}))
			});
			
			console.log(`Game ${gameId} restarted by player ${playerId}`);
		} catch (error) {
			console.error('Error handling restart_game request:', error);
			socket.emit('error', { message: 'Error restarting game' });
		}
	});
	
	// Handle startGame event
	socket.on('startGame', (options = {}, callback) => {
		try {
			const player = players.get(playerId);
			if (!player) {
				if (callback) callback({ success: false, error: 'Player not found' });
				return;
			}
			
			let gameId = player.gameId;
			
			// Create a new game if player is not in one
			if (!gameId) {
				gameId = createNewGame();
				player.gameId = gameId;
				socket.join(gameId);
			}
			
			const game = games.get(gameId);
			if (!game) {
				if (callback) callback({ success: false, error: 'Game not found' });
				return;
			}
			
			// Start the game
			game.state.status = 'playing';
			game.state.startTime = Date.now();
			
			// Add a computer player if there's only one human player
			if (game.players.length === 1 && !options.noComputer) {
				addComputerPlayer(gameId);
			}
			
			// Send initial game state to all players
			io.to(gameId).emit('game_started', {
				gameId: gameId,
				players: game.players.map(id => ({
					id: id,
					name: players.get(id) ? players.get(id).name : `Player_${id.substring(0, 5)}`,
					isComputer: computerPlayers.has(id)
				})),
				state: game.state
			});
			
			if (callback) callback({ success: true, gameId: gameId });
			console.log(`Game ${gameId} started by player ${playerId}`);
		} catch (error) {
			console.error('Error starting game:', error);
			if (callback) callback({ success: false, error: 'Server error' });
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
function createNewGame(gameId = null, settings = {}) {
	// Use provided gameId or generate a new UUID
	const id = gameId || uuidv4();
	
	// Set board size with sensible defaults
	const boardSize = settings.boardSize || 16;
	
	// Create empty board
	const board = Array(boardSize).fill().map(() => Array(boardSize).fill(0));
	
	// Set up home zones
	// Player 1 (blue) - bottom
	for (let z = boardSize - 2; z < boardSize; z++) {
		for (let x = 0; x < 8; x++) {
			board[z][x] = 6; // Blue home zone
		}
	}
	
	// Player 2 (orange) - top
	for (let z = 0; z < 2; z++) {
		for (let x = 8; x < boardSize; x++) {
			board[z][x] = 7; // Orange home zone
		}
	}
	
	// Initialize chess pieces
	// Define chess piece types and positions for player 1
	const player1Pieces = [
		{ type: 'pawn', x: 0, z: 14 },
		{ type: 'pawn', x: 1, z: 14 },
		{ type: 'pawn', x: 2, z: 14 },
		{ type: 'pawn', x: 3, z: 14 },
		{ type: 'pawn', x: 4, z: 14 },
		{ type: 'pawn', x: 5, z: 14 },
		{ type: 'pawn', x: 6, z: 14 },
		{ type: 'pawn', x: 7, z: 14 },
		{ type: 'rook', x: 0, z: 15 },
		{ type: 'knight', x: 1, z: 15 },
		{ type: 'bishop', x: 2, z: 15 },
		{ type: 'queen', x: 3, z: 15 },
		{ type: 'king', x: 4, z: 15 },
		{ type: 'bishop', x: 5, z: 15 },
		{ type: 'knight', x: 6, z: 15 },
		{ type: 'rook', x: 7, z: 15 }
	].map(piece => ({ ...piece, player: 1 }));
	
	// Define chess piece types and positions for player 2
	const player2Pieces = [
		{ type: 'pawn', x: 8, z: 1 },
		{ type: 'pawn', x: 9, z: 1 },
		{ type: 'pawn', x: 10, z: 1 },
		{ type: 'pawn', x: 11, z: 1 },
		{ type: 'pawn', x: 12, z: 1 },
		{ type: 'pawn', x: 13, z: 1 },
		{ type: 'pawn', x: 14, z: 1 },
		{ type: 'pawn', x: 15, z: 1 },
		{ type: 'rook', x: 8, z: 0 },
		{ type: 'knight', x: 9, z: 0 },
		{ type: 'bishop', x: 10, z: 0 },
		{ type: 'queen', x: 11, z: 0 },
		{ type: 'king', x: 12, z: 0 },
		{ type: 'bishop', x: 13, z: 0 },
		{ type: 'knight', x: 14, z: 0 },
		{ type: 'rook', x: 15, z: 0 }
	].map(piece => ({ ...piece, player: 2 }));
	
	// Combine all chess pieces
	const chessPieces = [...player1Pieces, ...player2Pieces];
	
	games.set(id, {
		id: id,
		players: [],
		maxPlayers: settings.maxPlayers || 2048,
		hasComputerPlayer: false,
		state: {
			board: board,
			chessPieces: chessPieces,
			gameMode: settings.gameMode || 'standard',
			difficulty: settings.difficulty || 'normal',
			startLevel: settings.startLevel || 1,
			boardSize: boardSize,
			renderMode: settings.renderMode || '3d',
			currentPlayer: 1,
			turnPhase: 'tetris',
			status: 'waiting'
		},
		created: Date.now()
	});
	
	console.log(`New game created: ${id}`);
	
	// Always add a computer player to each game (except for global game)
	if (id !== GLOBAL_GAME_ID) {
		addComputerPlayer(id);
	}
	
	return id;
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
			type: 'king',
			player: 2, // Computer is usually player 2
			x: 4,
			z: 0
		});
		
		newChessPieces.push({
			type: 'queen',
			player: 2,
			x: 3,
			z: 0
		});
		
		newChessPieces.push({
			type: 'pawn',
			player: 2,
			x: 0,
			z: 1
		});
		
		newChessPieces.push({
			type: 'pawn',
			player: 2,
			x: 1,
			z: 1
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
	// Instead of using an ID, we'll find it by matching all properties
	const originalPieceIndex = newChessPieces.findIndex(p => 
		p.type === piece.type && p.player === piece.player && 
		p.x === piece.x && p.z === piece.z);
	
	if (originalPieceIndex !== -1) {
		// Movement based on piece type and strategy
		let dx = 0;
		let dz = 0; // Changed from dy to dz to match our coordinate system
		
		switch (piece.type) {
			case 'king':
				// Kings move 1 square in any direction
				dx = Math.floor(Math.random() * 3) - 1;
				dz = Math.floor(Math.random() * 3) - 1;
				break;
			case 'queen':
				// Queens can move in any direction, multiple squares
				if (Math.random() < 0.5) {
					// Diagonal
					dx = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
					dz = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
				} else {
					// Straight
					if (Math.random() < 0.5) {
						dx = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
						dz = 0;
					} else {
						dx = 0;
						dz = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
					}
				}
				break;
			case 'rook':
				// Rooks move in straight lines
				if (Math.random() < 0.5) {
					dx = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
					dz = 0;
				} else {
					dx = 0;
					dz = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
				}
				break;
			case 'bishop':
				// Bishops move diagonally
				dx = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
				dz = (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
				break;
			case 'knight':
				// Knights move in L-shape
				if (Math.random() < 0.5) {
					dx = (Math.random() < 0.5 ? 1 : -1) * 2;
					dz = (Math.random() < 0.5 ? 1 : -1) * 1;
				} else {
					dx = (Math.random() < 0.5 ? 1 : -1) * 1;
					dz = (Math.random() < 0.5 ? 1 : -1) * 2;
				}
				break;
			case 'pawn':
				// Pawns move forward 1 or 2 squares and capture diagonally
				if (Math.random() < strategy.aggressiveness) {
					// Try to capture (diagonal move)
					dx = (Math.random() < 0.5 ? 1 : -1);
					dz = 1;
				} else {
					// Move forward
					dx = 0;
					dz = Math.random() < 0.2 ? 2 : 1; // 20% chance for 2-square move
				}
				break;
			default:
				// Default movement
				dx = Math.floor(Math.random() * 3) - 1;
				dz = Math.floor(Math.random() * 3) - 1;
		}
		
		// Apply movement based on strategy
		if (Math.random() < strategy.explorationRate) {
			// More exploratory moves - increase movement distance
			dx = dx * 1.5;
			dz = dz * 1.5;
		}
		
		// Update position - directly accessing x and z properties
		newChessPieces[originalPieceIndex].x += Math.round(dx);
		newChessPieces[originalPieceIndex].z += Math.round(dz);
		
		// Ensure position is within bounds
		const boardSize = 16; // Use a reasonable default if not available
		newChessPieces[originalPieceIndex].x = Math.max(0, Math.min(boardSize - 1, newChessPieces[originalPieceIndex].x));
		newChessPieces[originalPieceIndex].z = Math.max(0, Math.min(boardSize - 1, newChessPieces[originalPieceIndex].z));
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

/**
 * Initialize the global game that all players join by default
 */
function initializeGlobalGame() {
	console.log('Initializing global game...');
	
	// Check if global game already exists
	if (games.has(GLOBAL_GAME_ID)) {
		console.log('Global game already exists, using existing game');
		return;
	}
	
	// Create the global game
	createNewGame(GLOBAL_GAME_ID, {
		maxPlayers: 2048, // Allow up to 2048 players as per requirements
		gameMode: 'standard',
		difficulty: 'normal',
		boardSize: 16
	});
	
	console.log(`Global game created with ID: ${GLOBAL_GAME_ID}`);
}

// Start the server
server.listen(PORT, () => {
	console.log(`Shaktris server running on port ${PORT}`);
	console.log(`- Game: http://localhost:${PORT}/`);
	console.log(`- 2D Mode: http://localhost:${PORT}/2d`);
	console.log(`- API: http://localhost:${PORT}/api`);
});
