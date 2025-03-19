/**
 * API Routes for Shaktris
 * 
 * This file defines the RESTful API endpoints for the Shaktris game,
 * including computer player integration.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const router = express.Router();

// In-memory storage (replace with database in production)
const computerPlayers = {};
const games = {};
const apiTokens = {};

// Import the board visualization utility
const boardVisualization = require('../server/utils/boardVisualization');

/**
 * Generate a secure API token
 */
function generateApiToken() {
	return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate API token
 */
function validateApiToken(playerId, token) {
	return apiTokens[playerId] === token;
}

/**
 * API root endpoint
 */
router.get('/', (req, res) => {
	res.json({
		success: true,
		message: 'Shaktris API is running',
		version: '1.0.0',
		endpoints: [
			'/computer-players/register',
			'/games',
			'/games/:gameId',
			'/games/:gameId/add-computer-player',
			'/games/:gameId/available-tetrominos',
			'/games/:gameId/chess-pieces',
			'/games/:gameId/computer-move',
			'/games/:gameId/visualization'
		]
	});
});

/**
 * Register a computer player
 */
router.post('/computer-players/register', (req, res) => {
	const { name, apiEndpoint, description } = req.body;
	
	if (!name) {
		return res.status(400).json({
			success: false,
			message: 'Name is required'
		});
	}
	
	const playerId = `ext-ai-${uuidv4().substring(0, 8)}`;
	const apiToken = generateApiToken();
	
	// Store computer player info
	computerPlayers[playerId] = {
		id: playerId,
		name,
		apiEndpoint,
		description,
		createdAt: new Date().toISOString()
	};
	
	// Store API token
	apiTokens[playerId] = apiToken;
	
	res.json({
		success: true,
		message: 'Computer player registered successfully',
		playerId,
		apiToken
	});
});

/**
 * Get all computer players
 */
router.get('/computer-players', (req, res) => {
	const playersList = Object.values(computerPlayers).map(player => ({
		id: player.id,
		name: player.name,
		description: player.description,
		createdAt: player.createdAt
	}));
	
	res.json({
		success: true,
		computerPlayers: playersList
	});
});

/**
 * Create a new game
 */
router.post('/games', (req, res) => {
	const { playerId, username, options = {} } = req.body;
	
	if (!playerId || !username) {
		return res.status(400).json({
			success: false,
			message: 'Player ID and username are required'
		});
	}
	
	const gameId = uuidv4();
	
	// Create game
	games[gameId] = {
		id: gameId,
		createdAt: new Date().toISOString(),
		status: 'waiting',
		players: [
			{
				id: playerId,
				name: username,
				isComputerPlayer: playerId.startsWith('ext-ai-') || playerId.startsWith('int-ai-'),
				joinedAt: new Date().toISOString()
			}
		],
		options: {
			maxPlayers: options.maxPlayers || 2048,
			gameMode: options.gameMode || 'standard',
			difficulty: options.difficulty || 'normal',
			...options
		},
		board: [],
		chessPieces: [],
		currentTurn: playerId,
		currentMoveType: 'tetromino',
		availableTetrominos: {}
	};
	
	// Initialize game state
	initializeGameState(gameId);
	
	res.json({
		success: true,
		message: 'Game created successfully',
		gameId,
		game: games[gameId]
	});
});

/**
 * Get all games
 */
router.get('/games', (req, res) => {
	const gamesList = Object.keys(games).filter(gameId => {
		const game = games[gameId];
		return game.status === 'waiting' || game.status === 'active';
	});
	
	res.json({
		success: true,
		games: gamesList
	});
});

/**
 * Get game details
 */
router.get('/games/:gameId', (req, res) => {
	const { gameId } = req.params;
	
	if (!games[gameId]) {
		return res.status(404).json({
			success: false,
			message: 'Game not found'
		});
	}
	
	res.json({
		success: true,
		game: games[gameId]
	});
});

/**
 * Add computer player to game
 */
router.post('/games/:gameId/add-computer-player', (req, res) => {
	const { gameId } = req.params;
	const { computerId, apiToken } = req.body;
	
	if (!games[gameId]) {
		return res.status(404).json({
			success: false,
			message: 'Game not found'
		});
	}
	
	if (!computerId) {
		return res.status(400).json({
			success: false,
			message: 'Computer ID is required'
		});
	}
	
	// Validate API token for external computer players
	if (computerId.startsWith('ext-ai-') && !validateApiToken(computerId, apiToken)) {
		return res.status(401).json({
			success: false,
			message: 'Invalid API token'
		});
	}
	
	// Check if player already in game
	if (games[gameId].players.some(p => p.id === computerId)) {
		return res.status(400).json({
			success: false,
			message: 'Computer player already in game'
		});
	}
	
	// Check if game is full
	if (games[gameId].players.length >= games[gameId].options.maxPlayers) {
		return res.status(400).json({
			success: false,
			message: 'Game is full'
		});
	}
	
	// Get computer player info
	const computerPlayer = computerPlayers[computerId] || {
		id: computerId,
		name: `Computer ${computerId.substring(0, 8)}`,
		isBuiltIn: !computerId.startsWith('ext-ai-')
	};
	
	// Add computer player to game
	games[gameId].players.push({
		id: computerId,
		name: computerPlayer.name,
		isComputerPlayer: true,
		joinedAt: new Date().toISOString()
	});
	
	// Update game status if needed
	if (games[gameId].status === 'waiting' && games[gameId].players.length >= 2) {
		games[gameId].status = 'active';
	}
	
	// Initialize computer player state
	initializePlayerState(gameId, computerId);
	
	res.json({
		success: true,
		message: 'Computer player added to game',
		gameState: games[gameId]
	});
});

/**
 * Get available tetrominos
 */
router.get('/games/:gameId/available-tetrominos', (req, res) => {
	const { gameId } = req.params;
	const { playerId, apiToken } = req.query;
	
	if (!games[gameId]) {
		return res.status(404).json({
			success: false,
			message: 'Game not found'
		});
	}
	
	if (!playerId) {
		return res.status(400).json({
			success: false,
			message: 'Player ID is required'
		});
	}
	
	// Validate API token for external computer players
	if (playerId.startsWith('ext-ai-') && !validateApiToken(playerId, apiToken)) {
		return res.status(401).json({
			success: false,
			message: 'Invalid API token'
		});
	}
	
	// Check if player is in game
	if (!games[gameId].players.some(p => p.id === playerId)) {
		return res.status(400).json({
			success: false,
			message: 'Player not in game'
		});
	}
	
	// Get available tetrominos for player
	const tetrominos = games[gameId].availableTetrominos[playerId] || [];
	
	res.json({
		success: true,
		tetrominos
	});
});

/**
 * Get chess pieces
 */
router.get('/games/:gameId/chess-pieces', (req, res) => {
	const { gameId } = req.params;
	const { playerId, apiToken } = req.query;
	
	if (!games[gameId]) {
		return res.status(404).json({
			success: false,
			message: 'Game not found'
		});
	}
	
	if (!playerId) {
		return res.status(400).json({
			success: false,
			message: 'Player ID is required'
		});
	}
	
	// Validate API token for external computer players
	if (playerId.startsWith('ext-ai-') && !validateApiToken(playerId, apiToken)) {
		return res.status(401).json({
			success: false,
			message: 'Invalid API token'
		});
	}
	
	// Check if player is in game
	if (!games[gameId].players.some(p => p.id === playerId)) {
		return res.status(400).json({
			success: false,
			message: 'Player not in game'
		});
	}
	
	// Get chess pieces for player
	const chessPieces = games[gameId].chessPieces.filter(piece => piece.player === playerId);
	
	res.json({
		success: true,
		chessPieces
	});
});

/**
 * Make a computer move
 */
router.post('/games/:gameId/computer-move', (req, res) => {
	const { gameId } = req.params;
	const { playerId, apiToken, moveType, moveData } = req.body;
	
	console.log('Received computer move request:', {
		gameId,
		playerId,
		moveType,
		moveData: JSON.stringify(moveData)
	});
	
	if (!games[gameId]) {
		return res.status(404).json({
			success: false,
			message: 'Game not found'
		});
	}
	
	if (!playerId || !moveType || !moveData) {
		return res.status(400).json({
			success: false,
			message: 'Player ID, move type, and move data are required'
		});
	}
	
	// Validate API token for external computer players
	if (playerId.startsWith('ext-ai-') && !validateApiToken(playerId, apiToken)) {
		return res.status(401).json({
			success: false,
			message: 'Invalid API token'
		});
	}
	
	// Check if player is in game
	if (!games[gameId].players.some(p => p.id === playerId)) {
		return res.status(400).json({
			success: false,
			message: 'Player not in game'
		});
	}
	
	// Check if move type matches current move type
	if (games[gameId].currentMoveType !== moveType) {
		return res.status(400).json({
			success: false,
			message: `Expected ${games[gameId].currentMoveType} move, got ${moveType}`
		});
	}
	
	// Process move based on type
	if (moveType === 'tetromino') {
		// Ensure moveData has the required properties
		if (!moveData) {
			return res.status(400).json({
				success: false,
				message: 'Move data is required'
			});
		}
		
		// Log the move data for debugging
		console.log('Tetromino move data:', JSON.stringify(moveData));
		
		// Process tetromino placement
		const result = processTetrominoMove(gameId, playerId, moveData);
		
		if (!result.success) {
			return res.status(400).json(result);
		}
		
		// Update game state
		games[gameId].currentMoveType = 'chess';
	} else if (moveType === 'chess') {
		// Process chess move
		const result = processChessMove(gameId, playerId, moveData);
		
		if (!result.success) {
			return res.status(400).json(result);
		}
		
		// Update game state
		games[gameId].currentMoveType = 'tetromino';
	} else {
		return res.status(400).json({
			success: false,
			message: `Invalid move type: ${moveType}`
		});
	}
	
	res.json({
		success: true,
		message: `${moveType} move processed successfully`,
		gameState: games[gameId]
	});
});

/**
 * Skip chess move
 */
router.post('/games/:gameId/skip-chess-move', (req, res) => {
	const { gameId } = req.params;
	const { playerId, apiToken } = req.body;
	
	if (!games[gameId]) {
		return res.status(404).json({
			success: false,
			message: 'Game not found'
		});
	}
	
	if (!playerId) {
		return res.status(400).json({
			success: false,
			message: 'Player ID is required'
		});
	}
	
	// Validate API token for external computer players
	if (playerId.startsWith('ext-ai-') && !validateApiToken(playerId, apiToken)) {
		return res.status(401).json({
			success: false,
			message: 'Invalid API token'
		});
	}
	
	// Check if player is in game
	if (!games[gameId].players.some(p => p.id === playerId)) {
		return res.status(400).json({
			success: false,
			message: 'Player not in game'
		});
	}
	
	// Update game state to move to tetromino phase
	games[gameId].currentMoveType = 'tetromino';
	
	res.json({
		success: true,
		message: 'Chess move skipped',
		skipToTetromino: true
	});
});

/**
 * Initialize game state
 */
function initializeGameState(gameId) {
	const game = games[gameId];
	
	// Create empty board (20x20)
	game.board = Array(20).fill().map(() => Array(20).fill(null));
	
	// Initialize player states
	game.players.forEach(player => {
		initializePlayerState(gameId, player.id);
	});
}

/**
 * Initialize player state
 */
function initializePlayerState(gameId, playerId) {
	const game = games[gameId];
	const playerIndex = game.players.findIndex(p => p.id === playerId);
	
	// Skip if player not found
	if (playerIndex === -1) return;
	
	// Determine player's home zone based on index
	let homeX, homeY;
	
	switch (playerIndex) {
		case 0: // Bottom left
			homeX = 0;
			homeY = 19;
			break;
		case 1: // Top right
			homeX = 19;
			homeY = 0;
			break;
		case 2: // Top left
			homeX = 0;
			homeY = 0;
			break;
		case 3: // Bottom right
			homeX = 19;
			homeY = 19;
			break;
		default:
			homeX = 10;
			homeY = 10;
	}
	
	// Create home zone (3x3)
	for (let y = 0; y < 3; y++) {
		for (let x = 0; x < 3; x++) {
			const boardX = homeX + (playerIndex === 0 || playerIndex === 2 ? x : -x);
			const boardY = homeY + (playerIndex === 0 || playerIndex === 3 ? -y : y);
			
			// Ensure coordinates are within bounds
			if (boardX >= 0 && boardX < 20 && boardY >= 0 && boardY < 20) {
				game.board[boardY][boardX] = {
					player: playerId,
					type: 'home'
				};
			}
		}
	}
	
	// Generate initial tetrominos for the player
	if (!game.availableTetrominos[playerId]) {
		game.availableTetrominos[playerId] = generateTetrominos();
	}
	
	// Add chess pieces with proper position objects
	const chessPieces = [
		// Back row
		{ type: 'rook', id: `${playerId}_rook1`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 0 : -0), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -0 : 0) } },
		{ type: 'knight', id: `${playerId}_knight1`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 0 : -0), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -1 : 1) } },
		{ type: 'bishop', id: `${playerId}_bishop1`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 1 : -1), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -0 : 0) } },
		{ type: 'queen', id: `${playerId}_queen`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 1 : -1), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -1 : 1) } },
		{ type: 'king', id: `${playerId}_king`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 2 : -2), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -0 : 0) } },
		{ type: 'bishop', id: `${playerId}_bishop2`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 2 : -2), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -1 : 1) } },
		{ type: 'knight', id: `${playerId}_knight2`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 2 : -2), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -2 : 2) } },
		{ type: 'rook', id: `${playerId}_rook2`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 1 : -1), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -2 : 2) } },
		
		// Pawns (front row) - Adding all 8 pawns for standard chess setup
		{ type: 'pawn', id: `${playerId}_pawn1`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 0 : -0), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -2 : 2) } },
		{ type: 'pawn', id: `${playerId}_pawn2`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 1 : -1), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -2 : 2) } },
		{ type: 'pawn', id: `${playerId}_pawn3`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 2 : -2), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -2 : 2) } },
		{ type: 'pawn', id: `${playerId}_pawn4`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 3 : -3), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -2 : 2) } },
		{ type: 'pawn', id: `${playerId}_pawn5`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 4 : -4), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -2 : 2) } },
		{ type: 'pawn', id: `${playerId}_pawn6`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 5 : -5), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -2 : 2) } },
		{ type: 'pawn', id: `${playerId}_pawn7`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 6 : -6), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -2 : 2) } },
		{ type: 'pawn', id: `${playerId}_pawn8`, position: { x: homeX + (playerIndex === 0 || playerIndex === 2 ? 7 : -7), y: homeY + (playerIndex === 0 || playerIndex === 3 ? -2 : 2) } }
	];
	
	chessPieces.forEach(piece => {
		// Ensure coordinates are within bounds
		if (piece.position.x >= 0 && piece.position.x < 20 && piece.position.y >= 0 && piece.position.y < 20) {
			game.chessPieces.push({
				...piece,
				player: playerId
			});
		}
	});

	// Initialize player's last tetromino placement
	const tetrominoPlayerIndex = game.players.findIndex(p => p.id === playerId);
	if (tetrominoPlayerIndex !== -1) {
		// If players is an array
		if (!game.players[tetrominoPlayerIndex].lastTetrominoPlacement) {
			game.players[tetrominoPlayerIndex].lastTetrominoPlacement = {
				position: { x: homeX, y: homeY },
				shape: 'I',
				rotation: 0
			};
		}
	} else if (game.players[playerId]) {
		// If players is an object indexed by ID
		if (!game.players[playerId].lastTetrominoPlacement) {
			game.players[playerId].lastTetrominoPlacement = {
				position: { x: homeX, y: homeY },
				shape: 'I',
				rotation: 0
			};
		}
	}
}

/**
 * Generate tetrominos
 * @param {number} count - Number of tetrominos to generate (default: 3)
 * @returns {Array} Array of tetromino objects
 */
function generateTetrominos(count = 3) {
	const shapes = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
	const tetrominos = [];
	
	// Generate the specified number of random tetrominos
	for (let i = 0; i < count; i++) {
		const shape = shapes[Math.floor(Math.random() * shapes.length)];
		const rotations = shape === 'O' ? 1 : 4;
		
		tetrominos.push({
			id: `tetromino-${uuidv4().substring(0, 4)}`,
			shape,
			rotations
		});
	}
	
	return tetrominos;
}

/**
 * Process tetromino move
 */
function processTetrominoMove(gameId, playerId, moveData) {
	const game = games[gameId];
	
	// Log the move data for debugging
	console.log('Processing tetromino move:', JSON.stringify(moveData));
	
	// Support multiple ways of specifying the shape
	let shape = moveData.pieceType || moveData.shape || moveData.type;
	
	// If shape is still undefined, use a default shape
	if (!shape) {
		console.log('No shape found in moveData, using default shape I');
		shape = 'I';
	}
	
	// Validate the shape is one of the standard Tetris shapes
	const validShapes = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
	if (!validShapes.includes(shape)) {
		console.log(`Invalid shape: ${shape}, using default shape I`);
		shape = 'I';
	}
	
	console.log(`Using tetromino shape: ${shape}`);
	
	const rotation = moveData.rotation || 0;
	const x = moveData.x || (moveData.position && moveData.position.x) || 10;
	const y = moveData.y || (moveData.position && moveData.position.y) || 10;
	
	// Validate tetromino shape
	const availableTetrominos = game.availableTetrominos[playerId] || [];
	const tetromino = availableTetrominos.find(t => t.shape === shape);
	
	if (!tetromino) {
		console.log(`No matching tetromino found for shape ${shape}, creating one`);
		// If no matching tetromino is found, create one for this move
		// This is a temporary solution to make the computer player work
		const newTetromino = {
			id: `tetromino-${Math.random().toString(36).substring(2, 6)}`,
			shape: shape,
			rotations: shape === 'O' ? 1 : 4
		};
		
		// Add the new tetromino to the player's available tetrominos
		if (!game.availableTetrominos[playerId]) {
			game.availableTetrominos[playerId] = [];
		}
		game.availableTetrominos[playerId].push(newTetromino);
		
		// Use the new tetromino for this move
		return processTetrominoMove(gameId, playerId, moveData);
	}
	
	// Simple validation for demo purposes
	// In a real implementation, we would check connectivity, collisions, etc.
	if (x < 0 || x >= 20 || y < 0 || y >= 20) {
		return {
			success: false,
			message: 'Tetromino placement out of bounds'
		};
	}
	
	// Place tetromino on board (simplified)
	if (!game.board[y]) {
		game.board[y] = [];
	}
	game.board[y][x] = {
		player: playerId,
		type: 'tetromino',
		shape: shape
	};
	
	// Remove used tetromino and generate a new one
	game.availableTetrominos[playerId] = availableTetrominos
		.filter(t => t.id !== tetromino.id)
		.concat(generateTetrominos(1));
	
	// Update player's last tetromino placement
	const playerIndex = game.players.findIndex(p => p.id === playerId);
	if (playerIndex !== -1) {
		// If players is an array
		game.players[playerIndex].lastTetrominoPlacement = {
			position: { x, y },
			shape,
			rotation
		};
	} else if (game.players[playerId]) {
		// If players is an object indexed by ID
		game.players[playerId].lastTetrominoPlacement = {
			position: { x, y },
			shape,
			rotation
		};
	}

	return {
		success: true,
		message: 'Tetromino placed successfully'
	};
}

/**
 * Process chess move
 */
function processChessMove(gameId, playerId, moveData) {
	const game = games[gameId];
	
	// Handle skip move request
	if (moveData.skipMove) {
		console.log(`Player ${playerId} is skipping chess move`);
		
		// Update game state to move to tetromino phase
		game.currentMoveType = 'tetromino';
		
		return {
			success: true,
			message: 'Chess move skipped',
			skipToTetromino: true
		};
	}
	
	// Extract move coordinates, handling both formats
	let pieceId, fromX, fromY, toX, toY;
	
	if (moveData.position) {
		// Format with nested position object
		pieceId = moveData.pieceId;
		fromX = moveData.position.fromX;
		fromY = moveData.position.fromY;
		toX = moveData.position.toX;
		toY = moveData.position.toY;
	} else {
		// Format with direct properties
		pieceId = moveData.pieceId;
		fromX = moveData.fromX;
		fromY = moveData.fromY;
		toX = moveData.toX;
		toY = moveData.toY;
	}
	
	// Find the piece
	const pieceIndex = game.chessPieces.findIndex(p => p.id === pieceId && p.player === playerId);
	
	if (pieceIndex === -1) {
		return {
			success: false,
			message: `Chess piece not found: ${pieceId}`
		};
	}
	
	const piece = game.chessPieces[pieceIndex];
	
	// Ensure piece has a position property
	if (!piece.position) {
		// If piece has direct x,y properties, create a position object
		if (typeof piece.x === 'number' && typeof piece.y === 'number') {
			piece.position = {
				x: piece.x,
				y: piece.y
			};
		} else {
			return {
				success: false,
				message: 'Chess piece has no valid position'
			};
		}
	}
	
	// Validate current position
	if (piece.position.x !== fromX || piece.position.y !== fromY) {
		return {
			success: false,
			message: `Chess piece is not at position (${fromX}, ${fromY})`
		};
	}
	
	// Simple validation for demo purposes
	// In a real implementation, we would check valid moves, captures, etc.
	if (toX < 0 || toX >= 20 || toY < 0 || toY >= 20) {
		return {
			success: false,
			message: 'Chess move out of bounds'
		};
	}
	
	// Check if destination is on the board
	if (!game.board[toY][toX]) {
		return {
			success: false,
			message: 'Destination is not on the board'
		};
	}
	
	// Check for capture
	const capturedPieceIndex = game.chessPieces.findIndex(p => {
		// Ensure the piece has a position property
		if (!p.position) {
			if (typeof p.x === 'number' && typeof p.y === 'number') {
				p.position = {
					x: p.x,
					y: p.y
				};
			} else {
				return false; // Skip pieces without valid position
			}
		}
		
		return p.position.x === toX && 
			p.position.y === toY && 
			p.player !== playerId;
	});
	
	if (capturedPieceIndex !== -1) {
		// Remove captured piece
		game.chessPieces.splice(capturedPieceIndex, 1);
	}
	
	// Move piece
	piece.position.x = toX;
	piece.position.y = toY;
	piece.moves = (piece.moves || 0) + 1;
	
	// Check for pawn promotion
	if (piece.type === 'pawn' && piece.moves >= 8) {
		piece.type = 'knight';
	}
	
	return {
		success: true,
		message: 'Chess piece moved successfully'
	};
}

// Add a new endpoint to get the game board visualization
router.get('/games/:gameId/visualization', (req, res) => {
	try {
		const gameId = req.params.gameId;
		const playerId = req.query.playerId;
		const options = {
			centerX: req.query.centerX ? parseInt(req.query.centerX) : undefined,
			centerY: req.query.centerY ? parseInt(req.query.centerY) : undefined,
			highlightX: req.query.highlightX ? parseInt(req.query.highlightX) : undefined,
			highlightY: req.query.highlightY ? parseInt(req.query.highlightY) : undefined,
			viewSize: req.query.viewSize ? parseInt(req.query.viewSize) : 20,
			showCoordinates: req.query.showCoordinates !== 'false',
			focusPlayerId: playerId
		};
		
		// Get the game from the game manager
		const game = games[gameId];
		
		if (!game) {
			return res.status(404).json({
				success: false,
				message: 'Game not found'
			});
		}
		
		// Generate the visualization
		const visualization = boardVisualization.visualizeBoard(game, options);
		
		// If a player ID was provided, also include their home zone visualization
		let homeZoneVisualization = null;
		if (playerId && game.players[playerId]) {
			homeZoneVisualization = boardVisualization.visualizePlayerHomeZone(game, playerId);
		}
		
		// Generate game summary
		const gameSummary = boardVisualization.generateGameSummary(game);
		
		return res.json({
			success: true,
			visualization,
			homeZoneVisualization,
			gameSummary
		});
	} catch (error) {
		console.error('Error generating game visualization:', error);
		return res.status(500).json({
			success: false,
			message: 'Error generating game visualization',
			error: error.message
		});
	}
});

module.exports = router; 