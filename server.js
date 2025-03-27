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
const { BOARD_SETTINGS, GAME_RULES } = require('./server/game/Constants');
const fs = require('fs');
// Import API routes
const apiRoutes = require('./routes/api');

// Import game managers
const { GameManager } = require('./server/game');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Define constants
const PORT = process.env.PORT || 3022; // Changed from 3020 to 3021

// Create a single GameManager instance to use for all connections
const gameManager = new GameManager();

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

// Serve socket.io-client from node_modules
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// In development mode (localhost), serve files from the public directory directly
app.use(express.static(path.join(__dirname, 'public')));

// In production, serve the React app from build directory
if (!isDevelopment) {
	app.use(express.static(path.join(__dirname, 'client/build')));
} 


// Catch-all route that will serve the React app in production, but public/index.html in development
app.get('/js/*', (req, res) => {

	//if no file exists with the filename bit of the url but there is one ending with .js, then load it
	const url = req.url;
	const file = (path.join(__dirname, 'public', url));
	if (!fs.existsSync(file) && fs.existsSync(file + '.js')) {
		res.sendFile(file + '.js');
	}
});

// Catch-all route that will serve the React app in production, but public/index.html in development
app.get('*', (req, res) => {
		if (isDevelopment) {
			res.sendFile(path.join(__dirname, 'public', 'index.html'));
		} else {
			res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
		}
	
});

// API routes
app.use('/api', apiRoutes);

// Route for 2D mode
app.get('/2d', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
			
			// Register player using GameManager
			const registrationResult = gameManager.registerPlayer(
				gameId,
				playerId,
				player.name,
				false // Not an observer
			);
			
			if (!registrationResult.success) {
				console.error(`Failed to register player ${playerId} with GameManager:`, registrationResult.error);
				if (callback) callback({ success: false, error: registrationResult.error });
				return;
			}
			
			// Add player to game
			game.players.push(playerId);
			player.gameId = gameId;
			
			// Join socket room for this game
			socket.join(gameId);
			
			// If home zone data was returned, add it to the game state
			if (registrationResult.homeZone) {
				if (!game.state.homeZones) {
					game.state.homeZones = {};
				}
				game.state.homeZones[playerId] = registrationResult.homeZone;
			}
			
			// If chess pieces were returned, add them to the game
			if (registrationResult.chessPieces && Array.isArray(registrationResult.chessPieces)) {
				if (!game.state.chessPieces) {
					game.state.chessPieces = [];
				}
				game.state.chessPieces.push(...registrationResult.chessPieces);
			}
			
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
	socket.on('tetromino_placed', (data, callback) => {
		try {
			const player = players.get(playerId);
			if (!player || !player.gameId) {
				if (callback) callback({ success: false, error: 'Not in a game' });
				return;
			}
			
			const gameId = player.gameId;
			const game = games.get(gameId);
			if (!game) {
				if (callback) callback({ success: false, error: 'Game not found' });
				return;
			}
			
			console.log(`Processing tetromino placement from player ${playerId} in game ${gameId}:`, JSON.stringify(data));
			
			// Validate the required data format - allow either type or pieceType
			if (!data || (!data.tetromino && !data.type && !data.pieceType)) {
				console.error(`Invalid tetromino data format: missing tetromino data`);
				socket.emit('tetrominoFailed', { message: 'Invalid tetromino data format: missing tetromino data' });
				if (callback) callback({ success: false, error: 'Invalid tetromino data format' });
				return;
			}
			
			// Extract the tetromino data - handle different possible formats
			let tetromino = data.tetromino || data;
			
			// Support both type and pieceType properties
			const pieceType = tetromino.pieceType || tetromino.type;
			if (!pieceType) {
				console.error(`Invalid tetromino data format: missing type/pieceType`);
				socket.emit('tetrominoFailed', { message: 'Invalid tetromino data format: missing type/pieceType' });
				if (callback) callback({ success: false, error: 'Invalid tetromino data format' });
				return;
			}
			
			// Create a proper game object format that our managers can work with
			// This is needed because the Map-based games storage is different from the
			// object format the game managers expect
			const gameObject = {
				id: gameId,
				board: game.state.board || { cells: {}, width: 0, height: 0 },
				chessPieces: game.state.chessPieces || [],
				players: game.players.reduce((obj, id) => {
					const playerObj = players.get(id) || computerPlayers.get(id) || {};
					obj[id] = {
						id,
						name: playerObj.name || `Player_${id.substring(0, 5)}`,
						homeZone: playerObj.homeZone || null,
						// Add any other player properties needed
					};
					return obj;
				}, {})
			};
			
			// Validate the tetromino placement
			if (!gameManager.tetrominoManager.isValidTetrisPiece(pieceType)) {
				console.log(`Invalid tetromino type: ${pieceType}`);
				socket.emit('tetrominoFailed', { message: `Invalid tetromino type: ${pieceType}` });
				if (callback) callback({ success: false, error: 'Invalid tetromino type' });
				return;
			}
			
			// Get the tetromino shape
			const tetrominoShape = gameManager.tetrominoManager.getTetrisPieceShape(pieceType, tetromino.rotation);
			
			console.log(`Tetromino shape:`, JSON.stringify(tetrominoShape));
			
			// Check if placement is valid
			console.log(`Checking placement at x=${tetromino.position.x}, z=${tetromino.position.z}, y=0, playerId=${playerId}`);
			const canPlace = gameManager.tetrominoManager.canPlaceTetromino(
				gameObject,
				tetromino,
				tetromino.position.x,
				tetromino.position.z,
				0, // Y level
				playerId
			);
			
			if (!canPlace) {
				console.log(`Invalid placement position for player ${playerId}`);
				socket.emit('tetrominoFailed', { message: 'Invalid placement position' });
				if (callback) callback({ success: false, error: 'Invalid placement position' });
				return;
			}
			
			console.log(`Placement is valid, placing tetromino`);
			
			// Place the tetromino
			gameManager.tetrominoManager.placeTetromino(
				gameObject,
				tetromino,
				tetromino.position.x,
				tetromino.position.z,
				playerId
			);
			
			// Update the game state with our modified gameObject
			game.state.board = gameObject.board;
			game.state.chessPieces = gameObject.chessPieces;
			
			// Check for completed rows and clear them
			const clearedRows = gameManager.boardManager.checkAndClearRows(gameObject);
			
			// Update game state again after row clearing
			game.state.board = gameObject.board;
			game.state.chessPieces = gameObject.chessPieces;
			
			// Update game state
			game.state.lastAction = {
				type: 'tetromino_placed',
				playerId: playerId,
				data: {
					...data,
					clearedRows
				}
			};
			
			console.log(`Tetromino placed successfully, cleared rows: ${clearedRows.length > 0 ? clearedRows.join(', ') : 'none'}`);
			
			// Check if player has any valid chess moves
			const hasValidMoves = gameManager.chessManager.hasValidChessMoves(gameObject, playerId);
			
			// Send success response to the client with hasValidMoves flag
			if (callback) callback({ 
				success: true, 
				boardState: game.state.board, 
				clearedRows,
				hasValidMoves // Include whether player has valid chess moves
			});
			
			// Broadcast updated state to all players in the game
			io.to(gameId).emit('game_update', game.state);
			
			// If rows were cleared, send a separate notification
			if (clearedRows.length > 0) {
				console.log(`Broadcasting row_cleared event for rows: ${clearedRows.join(', ')}`);
				io.to(gameId).emit('row_cleared', {
					rows: clearedRows,
					playerId: playerId
				});
			}
			
			// If player has no valid chess moves, send a notification to skip chess phase
			if (!hasValidMoves) {
				console.log(`Player ${playerId} has no valid chess moves, skipping chess phase`);
				io.to(gameId).emit('no_valid_chess_moves', {
					playerId: playerId,
					message: 'No valid chess moves available'
				});
				
				// Generate a new tetromino for the player
				const newTetromino = gameManager.tetrominoManager.generateTetrominos(gameObject, playerId)[0];
				
				// Send the new tetromino to the player
				socket.emit('new_tetromino', {
					tetromino: newTetromino,
					message: 'Skipping chess phase - no valid moves'
				});
			}
			
			// Update spectators
			updateSpectators(gameId, game.state);
		} catch (error) {
			console.error('Error processing tetromino placement:', error);
			if (callback) callback({ success: false, error: 'Server error' });
		}
	});
	
	// Handle request for a new tetromino
	socket.on('request_tetromino', (callback) => {
		try {
			console.log(`Player ${playerId} requested a new tetromino`);
			
			const player = players.get(playerId);
			if (!player || !player.gameId) {
				if (callback) callback({ success: false, error: 'Not in a game' });
				return;
			}
			
			const gameId = player.gameId;
			const game = games.get(gameId);
			if (!game) {
				if (callback) callback({ success: false, error: 'Game not found' });
				return;
			}
			
			// Generate a new tetromino for the player
			const tetrominos = gameManager.tetrominoManager.generateTetrominos(game, playerId);
			
			if (!tetrominos || tetrominos.length === 0) {
				console.error(`Failed to generate tetrominos for player ${playerId}`);
				if (callback) callback({ success: false, error: 'Failed to generate tetrominos' });
				return;
			}
			
			// Get the first tetromino from the generated set
			const newTetromino = tetrominos[0];
			
			// Update player's active tetromino in the game state
			if (!game.state.currentTurns) {
				game.state.currentTurns = {};
			}
			
			if (!game.state.currentTurns[playerId]) {
				game.state.currentTurns[playerId] = {
					playerId: playerId,
					phase: 'tetris',
					startTime: Date.now(),
					minTime: 10000 // 10 seconds minimum turn time
				};
			}
			
			game.state.currentTurns[playerId].activeTetromino = newTetromino;
			
			console.log(`Generated new tetromino for player ${playerId}:`, newTetromino);
			
			// Send the tetromino to the requesting player
			socket.emit('turn_update', game.state.currentTurns[playerId]);
			
			// Send success response
			if (callback) callback({ 
				success: true, 
				tetromino: newTetromino
			});
			
		} catch (error) {
			console.error(`Error generating tetromino for player ${playerId}:`, error);
			if (callback) callback({ success: false, error: 'Server error: ' + error.message });
		}
	});
	
	// Handle chess piece movement
	socket.on('chess_move', (data, callback) => {
		try {
			const player = players.get(playerId);
			if (!player || !player.gameId) {
				if (callback) callback({ success: false, error: 'Not in a game' });
				return;
			}
			
			const gameId = player.gameId;
			const game = games.get(gameId);
			if (!game) {
				if (callback) callback({ success: false, error: 'Game not found' });
				return;
			}
			
			console.log(`Processing chess move from player ${playerId} in game ${gameId}:`, JSON.stringify(data));
			
			// Validate data format
			if (!data || !data.pieceId || !data.targetPosition) {
				console.error(`Invalid chess move data format from player ${playerId}`);
				socket.emit('chessFailed', { message: 'Invalid chess move data format' });
				if (callback) callback({ success: false, error: 'Invalid chess move data format' });
				return;
			}
			
			// Create a proper game object format for our managers
			const gameObject = {
				id: gameId,
				board: game.state.board || { cells: {}, width: 0, height: 0 },
				chessPieces: game.state.chessPieces || [],
				players: game.players.reduce((obj, id) => {
					const playerObj = players.get(id) || computerPlayers.get(id) || {};
					obj[id] = {
						id,
						name: playerObj.name || `Player_${id.substring(0, 5)}`,
						homeZone: playerObj.homeZone || null,
						// Add any other player properties needed
					};
					return obj;
				}, {})
			};
			
			// Extract the move data
			const { pieceId, targetPosition } = data;
			
			// Find the piece in the game state
			const pieceIndex = gameObject.chessPieces.findIndex(piece => 
				piece && piece.id === pieceId
			);
			
			if (pieceIndex === -1) {
				console.log(`Chess piece not found: ${pieceId}`);
				socket.emit('chessFailed', { message: 'Chess piece not found' });
				if (callback) callback({ success: false, error: 'Chess piece not found' });
				return;
			}
			
			const piece = gameObject.chessPieces[pieceIndex];
			console.log(`Found chess piece: ${piece.type} at (${piece.position.x}, ${piece.position.z})`);
			
			// Check if it's the player's piece
			if (piece.player !== playerId) {
				console.log(`Not player's chess piece. Piece belongs to ${piece.player}, not ${playerId}`);
				socket.emit('chessFailed', { message: 'Not your chess piece' });
				if (callback) callback({ success: false, error: 'Not your chess piece' });
				return;
			}
			
			// Alternatively, find the piece in the board cells
			const sourceCell = gameManager.boardManager.getCell(gameObject.board, piece.position.x, piece.position.z);
			if (!sourceCell) {
				console.log(`Cannot find the source cell for piece at (${piece.position.x}, ${piece.position.z})`);
				socket.emit('chessFailed', { message: 'Source cell not found' });
				if (callback) callback({ success: false, error: 'Source cell not found' });
				return;
			}
			
			// Check if the move is valid
			console.log(`Checking if move to (${targetPosition.x}, ${targetPosition.z}) is valid`);
			const isValidMove = gameManager.chessManager.isValidChessMove(
				gameObject,
				piece,
				targetPosition.x,
				targetPosition.z
			);
			
			if (!isValidMove) {
				console.log(`Invalid chess move for ${piece.type} to (${targetPosition.x}, ${targetPosition.z})`);
				socket.emit('chessFailed', { message: 'Invalid chess move' });
				if (callback) callback({ success: false, error: 'Invalid chess move' });
				return;
			}
			
			console.log(`Move is valid, executing chess move`);
			
			// Get the source cell's chess piece object
			const chessPieceObj = sourceCell.find(item => 
				item && item.type === 'chess' && item.pieceId === pieceId
			);
			
			if (!chessPieceObj) {
				console.log(`Cannot find the chess piece object in the source cell`);
				socket.emit('chessFailed', { message: 'Chess piece data not found in cell' });
				if (callback) callback({ success: false, error: 'Chess piece data not found in cell' });
				return;
			}
			
			// Get the target cell
			const targetCell = gameManager.boardManager.getCell(gameObject.board, targetPosition.x, targetPosition.z);
			
			// Check for captured piece at the target position
			let capturedPiece = null;
			if (targetCell && targetCell.length > 0) {
				const capturedPieceObj = targetCell.find(item => 
					item && item.type === 'chess' && item.player !== playerId
				);
				
				if (capturedPieceObj) {
					// Find the actual piece in the chess pieces array
					const capturedPieceIndex = gameObject.chessPieces.findIndex(p => 
						p && p.id === capturedPieceObj.pieceId
					);
					
					if (capturedPieceIndex !== -1) {
						capturedPiece = gameObject.chessPieces[capturedPieceIndex];
						console.log(`Capturing piece: ${capturedPiece.type} belonging to ${capturedPiece.player}`);
						// Remove the captured piece
						gameObject.chessPieces.splice(capturedPieceIndex, 1);
					}
				}
			}
			
			// Remove the piece from the source cell
			const homeMarkersAtSource = sourceCell.filter(item => 
				item && item.type === 'home'
			);
			
			// Only keep home zone markers at the source
			if (homeMarkersAtSource.length > 0) {
				gameManager.boardManager.setCell(gameObject.board, piece.position.x, piece.position.z, homeMarkersAtSource);
			} else {
				// Remove the cell completely if no home markers
				gameManager.boardManager.setCell(gameObject.board, piece.position.x, piece.position.z, null);
			}
			
			// Prepare the target cell
			const targetCellContents = targetCell ? 
				targetCell.filter(item => item && item.type !== 'chess') : 
				[];
			
			// Add the chess piece to the target cell
			targetCellContents.push({
				...chessPieceObj,
				position: targetPosition // Update position in the cell object
			});
			
			// Set the target cell
			gameManager.boardManager.setCell(gameObject.board, targetPosition.x, targetPosition.z, targetCellContents);
			
			// Move the piece in the chessPieces array
			piece.position = targetPosition;
			piece.hasMoved = true;
			gameObject.chessPieces[pieceIndex] = piece;
			
			// Update the game state with our modified gameObject
			game.state.board = gameObject.board;
			game.state.chessPieces = gameObject.chessPieces;
			
			// Update game state
			game.state.lastAction = {
				type: 'chess_move',
				playerId: playerId,
				data: {
					...data,
					captured: capturedPiece
				}
			};
			
			console.log(`Chess move completed successfully`);
			
			// Send success response to the client
			if (callback) callback({ 
				success: true, 
				updatedPiece: piece,
				capturedPiece
			});
			
			// Broadcast updated state to all players in the game
			io.to(gameId).emit('game_update', game.state);
			
			// Send specific chess move event
			io.to(gameId).emit('chess_move', {
				playerId: playerId,
				movedPiece: piece,
				capturedPiece
			});
			
			// Check for game over (king captured)
			if (capturedPiece && capturedPiece.type === 'KING') {
				console.log(`Game over: ${playerId} captured a king!`);
				endGame(gameId, {
					winner: playerId,
					reason: 'king_captured'
				});
			}
			
			// Update spectators
			updateSpectators(gameId, game.state);
			
		} catch (error) {
			console.error('Error processing chess move:', error);
			socket.emit('chessFailed', { message: error.message || 'Server error processing chess move' });
			if (callback) callback({ success: false, error: 'Server error: ' + error.message });
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
			// Ensure data is an object and convert gameId to string if necessary
			let requestedGameId = GLOBAL_GAME_ID;
			
			if (data) {
				// Handle different possible formats of the gameId
				if (typeof data === 'string') {
					requestedGameId = data;
				} else if (typeof data === 'object') {
					if (data.gameId) {
						// Convert to string if it's an object or other non-string value
						requestedGameId = String(data.gameId) === 'null' ? GLOBAL_GAME_ID : String(data.gameId);
					}
				}
			}
			
			// console.log(`Player ${playerId} requested game state for game: ${requestedGameId}`);
			
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
			
			// Use player's current gameId or the requested one
			const gameId = player.gameId || requestedGameId;
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
			
			// console.log(`Sent game state to player ${playerId}`);
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
			
			// Create a new game using the GameManager
			const newGame = gameManager.createGame({
				width: game.state.boardSize || BOARD_SETTINGS.DEFAULT_WIDTH,
				height: game.state.boardSize || BOARD_SETTINGS.DEFAULT_HEIGHT,
				maxPlayers: game.players.length,
				homeZoneDistance: BOARD_SETTINGS.HOME_ZONE_DISTANCE
			});
			
			// Register all the existing players in the new game
			const chessPieces = [];
			game.players.forEach((playerId, index) => {
				const playerObject = players.get(playerId);
				const registrationResult = gameManager.registerPlayer(
					newGame.gameId, 
					playerId, 
					playerObject ? playerObject.name : `Player_${playerId.substring(0, 5)}`,
					false // Not an observer
				);
				
				if (registrationResult.success) {
					// Add player's chess pieces to the combined array
					if (registrationResult.chessPieces) {
						chessPieces.push(...registrationResult.chessPieces);
					}
				}
			});
			
			// Get the actual game object with all data
			const freshGame = gameManager.getGame(newGame.gameId);
			
			// Update the current game with the new board and home zones
			game.state = {
				...game.state,
				board: freshGame.board,
				homeZones: freshGame.homeZones,
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
			
			console.log(`Game ${gameId} restarted by player ${playerId} with proper home zones`);
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
	
	// Use the GameManager to create the game with proper board and home zones
	const newGameResult = gameManager.createGame({
		width: settings.boardSize || BOARD_SETTINGS.DEFAULT_WIDTH,
		height: settings.boardSize || BOARD_SETTINGS.DEFAULT_HEIGHT,
		maxPlayers: settings.maxPlayers || 2048,
		homeZoneDistance: BOARD_SETTINGS.HOME_ZONE_DISTANCE,
		gameId: id  // Ensure we pass the exact gameId to the GameManager
	});
	
	// Check if the game was created successfully
	if (!newGameResult || !newGameResult.gameId) {
		console.error('Failed to create game using GameManager');
		return null;
	}
	
	// Get the game object - using the exact same ID we provided
	const gameObj = gameManager.getGame(id);
	
	if (!gameObj) {
		console.error(`Game with ID ${id} not found in GameManager after creation`);
		return null;
	}
	
	// Create a lightweight game object for the socket server
	const game = {
		id: id,
		players: [],
		maxPlayers: settings.maxPlayers || 2048,
		hasComputerPlayer: false,
		state: {
			board: gameObj.board,
			homeZones: gameObj.homeZones,
			chessPieces: [],  // Will be populated as players join
			gameMode: settings.gameMode || 'standard',
			difficulty: settings.difficulty || 'normal',
			startLevel: settings.startLevel || 1,
			boardSize: Math.max(gameObj.board.width, gameObj.board.height), // Use the new sparse board properties
			renderMode: settings.renderMode || '3d',
			currentPlayer: 1,
			turnPhase: 'tetris',
			status: 'waiting'
		},
		created: Date.now()
	};
	
	// Store the game
	games.set(id, game);
	
	console.log(`New game created: ${id}`);
	
	// For global game, add a clearly identified AI opponent
	if (id === GLOBAL_GAME_ID) {
		const computerId = `ai-opponent-${uuidv4().substring(0, 8)}`;
		
		// Add AI player to the game
		computerPlayers.set(computerId, {
			id: computerId,
			name: `AI Opponent (Orange)`,
			gameId: id,
			isComputer: true,
			difficulty: COMPUTER_DIFFICULTY.MEDIUM,
			lastMoveTime: 0,
			consecutiveMoves: 0,
			minMoveInterval: 10000,
			strategy: generateComputerStrategy(COMPUTER_DIFFICULTY.MEDIUM)
		});
		
		// Register the computer player with the GameManager
		gameManager.registerPlayer(
			id,
			computerId,
			`AI Opponent (Orange)`,
			false
		);
		
		// Add to game's player list
		game.players.push(computerId);
		game.hasComputerPlayer = true;
		
		console.log(`AI opponent (${computerId}) added to global game`);
	} 
	// For other games, add a computer player if specified
	else if (settings.addComputerPlayer !== false) {
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
	const board = gameState.board || { cells: {}, minX: 0, maxX: 20, minZ: 0, maxZ: 20, width: 21, height: 21 };
	
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

/**
 * Simulate tetromino placement for AI planning
 * Note: This is a simplified simulation for the computer player and does not
 * use the actual TetrominoManager. Real placement should use the manager.
 */
function simulateTetrominoPlacement(board, computerId, strategy) {
	// Create a copy of the board
	// With the new sparse structure, we'll need a different approach
	let newBoard = {
		cells: {},
		minX: board.minX || 0,
		maxX: board.maxX || 20,
		minZ: board.minZ || 0,
		maxZ: board.maxZ || 20,
		width: board.width || 21,
		height: board.height || 21
	};
	
	// Copy existing cells
	if (board.cells) {
		newBoard.cells = JSON.parse(JSON.stringify(board.cells));
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
	let x, z;
	
	// Use the board boundaries for placement calculation
	const boardWidth = newBoard.maxX - newBoard.minX + 1;
	const boardHeight = newBoard.maxZ - newBoard.minZ + 1;
	
	if (Math.random() < strategy.explorationRate) {
		// Place further out
		x = newBoard.minX + Math.floor(Math.random() * (boardWidth - 3));
		z = newBoard.minZ + Math.floor(Math.random() * (boardHeight - 3));
	} else {
		// Place near existing structures (simplified)
		// In a real implementation, would analyze the board to find existing structures
		x = newBoard.minX + Math.floor(Math.random() * (boardWidth / 2)) + Math.floor(boardWidth / 4);
		z = newBoard.minZ + Math.floor(Math.random() * (boardHeight / 2)) + Math.floor(boardHeight / 4);
	}
	
	// Helper function to set a cell
	function setCell(x, z, type) {
		const key = `${x},${z}`;
		
		// Create tetromino cell object
		const tetrominoObj = {
			type: 'tetromino',
			pieceType: `type${type}`,
			player: computerId,
			placedAt: Date.now()
		};
		
		// If the cell already exists, add to its contents
		if (newBoard.cells[key] && Array.isArray(newBoard.cells[key])) {
			// Filter out any existing tetromino objects (replace them)
			const nonTetrominoContent = newBoard.cells[key].filter(item => 
				item && item.type !== 'tetromino'
			);
			// Add the new tetromino object
			newBoard.cells[key] = [...nonTetrominoContent, tetrominoObj];
		} else {
			// Create a new cell with the tetromino object
			newBoard.cells[key] = [tetrominoObj];
		}
		
		// Update board boundaries if necessary
		if (x < newBoard.minX) newBoard.minX = x;
		if (x > newBoard.maxX) newBoard.maxX = x;
		if (z < newBoard.minZ) newBoard.minZ = z;
		if (z > newBoard.maxZ) newBoard.maxZ = z;
		
		// Update width and height
		newBoard.width = newBoard.maxX - newBoard.minX + 1;
		newBoard.height = newBoard.maxZ - newBoard.minZ + 1;
	}
	
	// Place the tetromino
	// This would be improved by using actual tetromino shapes
	// For now, place a shape based on the tetromino type
	switch (tetrominoType) {
		case 1: // I shape
			for (let i = 0; i < 4; i++) {
				setCell(x, z + i, tetrominoType);
			}
			break;
		case 2: // J shape
			for (let i = 0; i < 3; i++) {
				setCell(x, z + i, tetrominoType);
			}
			setCell(x + 1, z + 2, tetrominoType);
			break;
		case 3: // L shape
			for (let i = 0; i < 3; i++) {
				setCell(x, z + i, tetrominoType);
			}
			setCell(x + 1, z, tetrominoType);
			break;
		case 4: // O shape
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					setCell(x + j, z + i, tetrominoType);
				}
			}
			break;
		default: // Other shapes (simplified)
			for (let i = 0; i < 3; i++) {
				for (let j = 0; j < 2; j++) {
					if (Math.random() < 0.7) {
						setCell(x + j, z + i, tetrominoType);
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
			player: 'player2',
			x: 4,
			z: 0
		});
		
		newChessPieces.push({
			type: 'queen',
			player: 'player2',
			x: 3,
			z: 0
		});
		
		newChessPieces.push({
			type: 'pawn',
			player: 'player2',
			x: 0,
			z: 1
		});
		
		newChessPieces.push({
			type: 'pawn',
			player: 'player2',
			x: 1,
			z: 1
		});
		
		return newChessPieces;
	}
	
	// Find all pieces belonging to the computer player
	const computerPieces = newChessPieces.filter(piece => piece.player === computerId);
	
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
		
		// No need for boundary checking as we now support boundless coordinates
		// The pieces can move freely in any direction
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
		boardSize: 30
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
