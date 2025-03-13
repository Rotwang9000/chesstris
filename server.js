/**
 * Shaktris Game Server
 * 
 * This server handles routing for the game, serving static files,
 * and providing API endpoints for multiplayer functionality.
 */

import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Server } from 'socket.io';
import fs from 'fs';
import GameManager from './server/game/GameManager.js';
import apiRouter, { setGameManager } from './server/routes/api.js';

// Get the directory name using ES modules approach
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Express app
const app = express();
const server = createServer(app);
const io = new Server(server);

// Set port
const PORT = process.env.PORT || 3020;

// Initialize the game manager
const gameManager = new GameManager();
console.log('Game Manager initialized');

// Game state - we'll use the GameManager's default game
let gameState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);

// Add logging middleware
app.use((req, res, next) => {
	console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
	next();
});

// Serve static files from the public directory
app.use(express.static(join(__dirname, 'public')));

// Parse JSON request bodies
app.use(express.json());

// Set up API routes
setGameManager(gameManager);
app.use('/api', apiRouter);

// Add a method to check if a game exists
GameManager.prototype.gameExists = function(gameId) {
	return this.games.has(gameId);
};

// Routes
// Both the root path and /2d path serve the same index.html
// The client-side code will determine which mode to use based on the URL
app.get('/', (req, res) => {
	console.log('Serving index.html for 3D mode');
	res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/2d', (req, res) => {
	console.log('Serving index.html for 2D mode');
	res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Debug routes
app.get('/debug', (req, res) => {
	console.log('Serving debug.html');
	res.sendFile(join(__dirname, 'public', 'debug.html'));
});

app.get('/debug-client', (req, res) => {
	console.log('Serving debug-client.html');
	res.sendFile(join(__dirname, 'public', 'debug-client.html'));
});

app.get('/api/debug/game-state', (req, res) => {
	console.log('API request for debug game state');
	try {
		// Get the current game state from the GameManager
		const currentState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
		
		// Add additional debug information
		const debugInfo = {
			gameState: currentState,
			serverInfo: {
				uptime: process.uptime(),
				memoryUsage: process.memoryUsage(),
				nodeVersion: process.version,
				platform: process.platform,
				connectedSockets: Object.keys(io.sockets.sockets).length
			},
			gameManager: {
				games: Array.from(gameManager.games.keys()),
				defaultGameId: gameManager.DEFAULT_GAME_ID
			}
		};
		
		res.json(debugInfo);
	} catch (error) {
		console.error('Error getting debug game state:', error);
		res.status(500).json({ error: 'Failed to get debug game state', details: error.message });
	}
});

// API endpoints
app.get('/api/game-state', (req, res) => {
	console.log('API request for game state');
	try {
		// Get the current game state from the GameManager
		const currentState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
		res.json(currentState);
	} catch (error) {
		console.error('Error getting game state:', error);
		res.status(500).json({ error: 'Failed to get game state' });
	}
});

app.post('/api/join-game', (req, res) => {
	const { playerId, username } = req.body;
		
		if (!playerId) {
		return res.status(400).json({ error: 'Player ID is required' });
	}
	
	try {
		// Add player to the game using GameManager
		const result = gameManager.addPlayer(gameManager.DEFAULT_GAME_ID, playerId, username);
		
		if (!result.success) {
			return res.status(400).json({ error: result.error });
		}
		
		// Get updated game state
		const updatedState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
		
		// Broadcast player joined event
		io.emit('player_joined', { playerId, username: username || 'Anonymous' });
		
		res.json({ success: true, gameState: updatedState });
	} catch (error) {
		console.error('Error adding player:', error);
		res.status(500).json({ error: 'Failed to add player to game' });
	}
});

app.post('/api/leave-game', (req, res) => {
	const { playerId } = req.body;
		
		if (!playerId) {
		return res.status(400).json({ error: 'Player ID is required' });
	}
	
	try {
		// Get the current game state
		const currentState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
		
		// Mark player as inactive
		if (currentState.players[playerId]) {
			currentState.players[playerId].isActive = false;
			
			// Broadcast player left event
			io.emit('player_left', { 
					playerId,
				username: currentState.players[playerId].username 
			});
		}
		
		res.json({ success: true });
	} catch (error) {
		console.error('Error handling player leave:', error);
		res.status(500).json({ error: 'Failed to process leave request' });
	}
});

// Socket.io connection handling
io.on('connection', (socket) => {
	console.log('New client connected:', socket.id);
	
	try {
		// Get the current game state from the GameManager
		const currentState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
		
		// Send current game state to new client
		socket.emit('game_update', currentState);
		console.log(`Sent initial game state to client ${socket.id}`);
	} catch (error) {
		console.error('Error sending initial game state:', error);
	}
	
	// Handle player joining
	socket.on('join_game', (data) => {
		console.log(`Received join_game event from client ${socket.id}:`, data);
		const { playerId, username, gameId } = data;
		
		try {
			// Use the default game ID if specified, or fall back to the GameManager's default
			const targetGameId = (gameId === 'default-game') ? gameManager.DEFAULT_GAME_ID : (gameId || gameManager.DEFAULT_GAME_ID);
			
			// Check if the player already exists in the game
			const currentState = gameManager.getGameState(targetGameId);
			if (currentState && currentState.players && currentState.players[playerId]) {
				// Player already exists, update their socket ID and mark as active
				console.log(`Player ${playerId} already exists in game ${targetGameId}, updating socket ID and marking as active`);
				currentState.players[playerId].socketId = socket.id;
				currentState.players[playerId].isActive = true;
				currentState.players[playerId].username = username || currentState.players[playerId].username;
				
				// Send success response to the client
				socket.emit('join_game_response', { 
					success: true, 
					message: 'Reconnected to existing game',
					gameId: targetGameId,
					playerId: playerId
				});
				
				// Send updated game state to all clients
				io.emit('game_update', currentState);
				
			return;
		}
		
			// Add player to the game using GameManager
			const result = gameManager.addPlayer(targetGameId, playerId, username);
		
		if (result.success) {
				// Store socket ID with player
				const currentState = gameManager.getGameState(targetGameId);
				currentState.players[playerId].socketId = socket.id;
				
				// Broadcast player joined event
				io.emit('player_joined', { playerId, username: username || 'Anonymous' });
				console.log(`Broadcasted player_joined event for ${username || 'Anonymous'} (${playerId})`);
				
				// Send success response to the client
				socket.emit('join_game_response', { 
					success: true, 
					message: 'Joined game successfully',
					gameId: targetGameId,
					playerId: playerId
				});
				
				// Send updated game state to all clients
				io.emit('game_update', currentState);
				console.log('Broadcasted updated game state to all clients');
				
				console.log(`Player ${username || 'Anonymous'} (${playerId}) joined the game`);
		} else {
				console.error('Failed to add player:', result.error);
				socket.emit('error', { message: result.error });
			}
		} catch (error) {
			console.error('Error handling join_game event:', error);
			socket.emit('error', { message: 'Failed to join game' });
		}
	});
	
	// Handle game creation
	socket.on('create_game', (data) => {
		console.log(`Received create_game event from client ${socket.id}:`, data);
		const { playerId, username, options } = data;
		
		try {
			// Create a new game
			const result = gameManager.createGame(options || {});
			
		if (result.success) {
				// Add the player to the game
				const addPlayerResult = gameManager.addPlayer(result.gameId, playerId, username);
				
				if (addPlayerResult.success) {
					// Store socket ID with player
					const currentState = gameManager.getGameState(result.gameId);
					currentState.players[playerId].socketId = socket.id;
					
					// Send success response to the client
					socket.emit('create_game_response', { 
						success: true, 
						message: 'Game created successfully',
						gameId: result.gameId,
						playerId: playerId
					});
					
					// Broadcast player joined event
					io.emit('player_joined', { playerId, username: username || 'Anonymous' });
					console.log(`Broadcasted player_joined event for ${username || 'Anonymous'} (${playerId})`);
					
					// Send updated game state to all clients
					io.emit('game_update', currentState);
					console.log('Broadcasted updated game state to all clients');
					
					console.log(`Player ${username || 'Anonymous'} (${playerId}) created and joined game ${result.gameId}`);
		} else {
					console.error('Failed to add player to new game:', addPlayerResult.error);
					socket.emit('create_game_response', { 
						success: false, 
						message: addPlayerResult.error
					});
				}
		} else {
				console.error('Failed to create game:', result.error);
				socket.emit('create_game_response', { 
				success: false,
					message: result.error
				});
			}
		} catch (error) {
			console.error('Error handling create_game event:', error);
			socket.emit('create_game_response', { 
				success: false,
				message: 'Failed to create game'
			});
		}
	});
	
	// Handle get game state
	socket.on('get_game_state', (data) => {
		console.log(`Received get_game_state event from client ${socket.id}:`, data);
		const { gameId } = data;
		
		try {
			// Use the default game ID if specified, or fall back to the GameManager's default
			const targetGameId = (gameId === 'default-game') ? gameManager.DEFAULT_GAME_ID : (gameId || gameManager.DEFAULT_GAME_ID);
			
			// Check if the game exists
			if (!gameManager.gameExists(targetGameId)) {
				socket.emit('game_state_response', { 
				success: false,
					message: 'Game not found'
			});
			return;
		}
		
			// Get the game state
			const gameState = gameManager.getGameState(targetGameId);
			
			// Send the game state to the client
			socket.emit('game_state_response', { 
			success: true,
				gameId: targetGameId,
				gameState
			});
			
			console.log(`Sent game state for ${targetGameId} to client ${socket.id}`);
	} catch (error) {
			console.error('Error handling get_game_state event:', error);
			socket.emit('game_state_response', { 
				success: false, 
				message: 'Failed to get game state'
			});
		}
	});
	
	// Handle player leaving
	socket.on('leave_game', (data) => {
		const { playerId } = data;
		
		try {
			// Get the current game state
			const currentState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
			
			// Mark player as inactive
			if (currentState.players[playerId]) {
				currentState.players[playerId].isActive = false;
				
				// Broadcast player left event
				io.emit('player_left', { 
					playerId, 
					username: currentState.players[playerId].username 
				});
				
				// Send updated game state to all clients
				io.emit('game_update', currentState);
				
				console.log(`Player ${currentState.players[playerId].username} (${playerId}) left the game`);
			}
	} catch (error) {
			console.error('Error handling leave_game event:', error);
		}
	});
	
	// Handle game state updates from clients
	socket.on('update_game_state', (data) => {
		try {
			// Get the current game state
			const currentState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
			
			// Merge the received data with the current game state
			// Note: In a production environment, you would validate this data
			Object.assign(currentState, data);
			currentState.lastUpdate = Date.now();
			
			// Broadcast updated game state to all clients
			socket.broadcast.emit('game_update', currentState);
	} catch (error) {
			console.error('Error handling update_game_state event:', error);
		}
	});
	
	// Handle tetromino placement
	socket.on('place_tetromino', (data) => {
		const { playerId, tetromino, position } = data;
		
		try {
			// Use GameManager to place the tetromino
			const result = gameManager.placeTetrisPiece(
				gameManager.DEFAULT_GAME_ID,
				playerId,
				{
					shape: tetromino.shape,
					rotation: tetromino.rotation,
					x: position.x,
					y: position.y
				}
			);
			
			// Broadcast tetromino placed event
			io.emit('tetromino_placed', { playerId, tetromino, position, result });
			
			// Send updated game state to all clients
			const updatedState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
			io.emit('game_update', updatedState);
			
			console.log(`Player ${playerId} placed a tetromino at (${position.x}, ${position.y})`);
	} catch (error) {
			console.error('Error placing tetromino:', error);
			socket.emit('error', { message: error.message });
		}
	});
	
	// Handle chess piece movement
	socket.on('move_chess_piece', (data) => {
		const { playerId, pieceId, fromPosition, toPosition } = data;
		
		try {
			// Use GameManager to move the chess piece
			const result = gameManager.moveChessPiece(
				gameManager.DEFAULT_GAME_ID,
				playerId,
				{
					fromX: fromPosition.x,
					fromY: fromPosition.y,
					toX: toPosition.x,
					toY: toPosition.y
				}
			);
			
			// Broadcast chess piece moved event
			io.emit('chess_piece_moved', { 
				playerId, 
				pieceId, 
				fromPosition, 
				toPosition,
				result
			});
			
			// Send updated game state to all clients
			const updatedState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
			io.emit('game_update', updatedState);
			
			console.log(`Player ${playerId} moved chess piece ${pieceId} from (${fromPosition.x}, ${fromPosition.y}) to (${toPosition.x}, ${toPosition.y})`);
	} catch (error) {
			console.error('Error moving chess piece:', error);
			socket.emit('error', { message: error.message });
		}
	});
	
	// Handle disconnection
	socket.on('disconnect', () => {
		console.log('Client disconnected:', socket.id);
		
		try {
			// Get the current game state
			const currentState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
			
			// Find player by socket ID and mark as inactive
			for (const playerId in currentState.players) {
				if (currentState.players[playerId].socketId === socket.id) {
					currentState.players[playerId].isActive = false;
					
					// Broadcast player left event
					io.emit('player_left', { 
						playerId, 
						username: currentState.players[playerId].username 
					});
					
					console.log(`Player ${currentState.players[playerId].username} (${playerId}) disconnected`);
					break;
				}
			}
	} catch (error) {
			console.error('Error handling disconnect event:', error);
		}
	});
});

// Start server only if not being imported for testing
const isTestEnvironment = process.env.NODE_ENV === 'test';

if (!isTestEnvironment) {
	server.listen(PORT, () => {
		console.log(`Shaktris server running on port ${PORT}`);
		console.log(`3D mode: http://localhost:${PORT}`);
		console.log(`2D mode: http://localhost:${PORT}/2d`);
	});
}

// Save game state periodically
setInterval(() => {
	try {
		// Get the current game state
		const currentState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
		
		// Only save if game has players
		if (Object.keys(currentState.players).length > 0) {
			const saveData = JSON.stringify(currentState, null, 2);
			fs.writeFile('game-state.json', saveData, (err) => {
					if (err) {
					console.error('Error saving game state:', err);
					}
				});
			}
	} catch (error) {
		console.error('Error saving game state:', error);
	}
}, 60000); // Save every minute

// Load game state on startup
try {
	if (fs.existsSync('game-state.json')) {
		const savedState = fs.readFileSync('game-state.json', 'utf8');
		const parsedState = JSON.parse(savedState);
		
		// Load the saved state into the GameManager
		try {
			// First check if the game exists
			if (gameManager.getGameState(gameManager.DEFAULT_GAME_ID)) {
				console.log('Loading saved game state into the default game');
				
				// Update the existing game with saved data
				Object.keys(parsedState).forEach(key => {
					if (key !== 'id') { // Don't override the game ID
						gameManager.getGameState(gameManager.DEFAULT_GAME_ID)[key] = parsedState[key];
					}
				});
				
				// Mark all players as inactive since they need to reconnect
				const currentState = gameManager.getGameState(gameManager.DEFAULT_GAME_ID);
				Object.keys(currentState.players).forEach(playerId => {
					currentState.players[playerId].isActive = false;
					currentState.players[playerId].socketId = null;
				});
				
				console.log('Saved game state loaded successfully');
			} else {
				console.warn('Default game not found, cannot load saved state');
			}
		} catch (loadError) {
			console.error('Error applying saved game state:', loadError);
		}
	}
} catch (err) {
	console.error('Error loading saved game state:', err);
}

// Export for testing
export { app, server, io, gameManager };