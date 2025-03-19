/**
 * Simple Computer Player Example for Shaktris
 * 
 * This is a basic implementation of an external computer player that connects
 * to the Shaktris API and makes simple strategic moves.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Configuration - replace with your own values
const API_URL = process.env.API_URL || 'http://localhost:3020/api';
const PLAYER_NAME = process.env.PLAYER_NAME || `SimpleBot-${uuidv4().substring(0, 6)}`;
const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:8080/callback';
const API_TOKEN = process.env.API_TOKEN || null;

// Game state tracking
let playerId = null;
let apiToken = null;
let gameId = null;
let lastMoveTime = 0;
let gameState = null;
let moveQueue = [];

// Strategy parameters
const strategy = {
	aggressiveness: 0.6,    // Higher values prioritize attacking
	defensiveness: 0.4,     // Higher values prioritize defending
	buildSpeed: 0.7,        // Higher values prioritize tetromino placement
	kingProtection: 0.8,    // Higher values prioritize king safety
	explorationRate: 0.5    // Higher values encourage exploring the board
};

// Get command line arguments
const args = process.argv.slice(2);
const MAX_MOVES = args[0] ? parseInt(args[0]) : Infinity;
let moveCount = 0;

/**
 * Register the computer player with the Shaktris server
 */
async function registerPlayer() {
	try {
		console.log(`Registering player: ${PLAYER_NAME}`);
		
		const response = await axios.post(`${API_URL}/computer-players/register`, {
			name: PLAYER_NAME,
			apiEndpoint: API_ENDPOINT,
			description: 'A simple example computer player for Shaktris'
		});
		
		if (response.data.success) {
			playerId = response.data.playerId;
			apiToken = response.data.apiToken;
			
			console.log(`Successfully registered as ${playerId}`);
			console.log(`API Token: ${apiToken}`);
			
			return true;
		} else {
			console.error('Registration failed:', response.data.message);
			return false;
		}
	} catch (error) {
		console.error('Error registering player:', error.response?.data || error.message);
		return false;
	}
}

/**
 * Get a list of available games
 */
async function getAvailableGames() {
	try {
		const response = await axios.get(`${API_URL}/games`);
		
		if (response.data.success) {
			return response.data.games;
		} else {
			console.error('Failed to get games:', response.data.message);
			return [];
		}
	} catch (error) {
		console.error('Error getting games:', error.response?.data || error.message);
		return [];
	}
}

/**
 * Join a game or create a new one if no games are available
 * @returns {Promise<Object>} Game state
 */
async function joinGame() {
	try {
		// Get list of available games
		const response = await axios.get(`${API_URL}/games`);
		const data = response.data;
		
		if (!data.success) {
			throw new Error(data.error || 'Failed to get games list');
		}
		
		console.log('Available games:', JSON.stringify(data.games, null, 2));
		
		// Check if games is an array or an object
		const gamesList = Array.isArray(data.games) ? data.games : Object.values(data.games || {});
		
		if (gamesList.length === 0) {
			console.log('No games available. Creating a new game...');
			return createAndJoinGame();
		}
		
		// Try to join each available game
		for (const gameEntry of gamesList) {
			// Handle case where gameEntry is a string (game ID) or an object with id property
			const gameEntryId = typeof gameEntry === 'string' ? gameEntry : (gameEntry && gameEntry.id);
			
			if (!gameEntryId) {
				console.log('Invalid game entry:', gameEntry);
				continue;
			}
			
			console.log(`Attempting to join game ${gameEntryId}...`);
			
			try {
				const joinResponse = await axios.post(`${API_URL}/games/${gameEntryId}/add-computer-player`, {
					computerId: playerId,
					apiToken: apiToken
				});
				
				const joinData = joinResponse.data;
				
				if (joinData.success) {
					console.log(`Successfully joined game ${gameEntryId}`);
					// Store the game ID in the module-level variable
					gameId = gameEntryId;
					return joinData.gameState;
				} else {
					console.log(`Failed to join game ${gameEntryId}: ${joinData.error || joinData.message}`);
					// Continue to try the next game
				}
			} catch (error) {
				console.error(`Error joining game ${gameEntryId}:`, error.message);
				// Continue to try the next game
			}
		}
		
		// If we couldn't join any existing games, create a new one
		console.log('Could not join any existing games. Creating a new game...');
		return createAndJoinGame();
	} catch (error) {
		console.error('Error joining game:', error.message);
		throw error;
	}
}

/**
 * Create a new game and join it
 * @returns {Promise<Object>} Game state
 */
async function createAndJoinGame() {
	try {
		const response = await axios.post(`${API_URL}/games`, {
			playerId: playerId,
			username: PLAYER_NAME,
			options: {
				maxPlayers: 2048 // Set to 2048 players
			}
		});
		
		const data = response.data;
		
		if (!data.success) {
			throw new Error(data.error || 'Failed to create game');
		}
		
		gameId = data.gameId;
		console.log(`Created and joined game ${gameId}`);
		return data.gameState;
	} catch (error) {
		console.error('Error creating game:', error);
		throw error;
	}
}

/**
 * Get the current game state
 * @returns {Promise<Object>} Game state
 */
async function getGameState() {
	if (!gameId) {
		console.log('❌ No game ID available');
		return null;
	}

	try {
		const response = await fetch(`${API_URL}/games/${gameId}?playerId=${playerId}&apiToken=${apiToken}`);
		if (response.ok) {
			const responseData = await response.json();
			console.log('Game state retrieved successfully');
			console.log('Raw response:', JSON.stringify(responseData).substring(0, 500) + '...');
			
			// Extract the actual game state from the response
			const gameState = responseData.game || responseData;
			
			if (gameState && gameState.id) {
				console.log(`Game ID: ${gameState.id}`);
				console.log(`Game status: ${gameState.status}`);
				
				if (gameState.players && Array.isArray(gameState.players)) {
					console.log(`Player count: ${gameState.players.length}`);
				} else {
					console.log('No players array found in game state');
				}

				if (gameState.chessPieces && gameState.chessPieces.length > 0) {
					console.log(`Chess pieces count: ${gameState.chessPieces.length}`);
					console.log('Chess pieces by player:');
					
					// Log the structure of the first chess piece to understand its format
					console.log('Chess piece structure:', JSON.stringify(gameState.chessPieces[0], null, 2));
					
					// Group chess pieces by player
					const piecesByPlayer = {};
					gameState.chessPieces.forEach(piece => {
						if (!piecesByPlayer[piece.player]) {
							piecesByPlayer[piece.player] = [];
						}
						piecesByPlayer[piece.player].push(piece);
					});
					
					// Log each player's pieces
					Object.keys(piecesByPlayer).forEach(playerId => {
						const playerName = gameState.players?.find?.(p => p.id === playerId)?.name || 'Unknown';
						console.log(`  Player ${playerName} (${playerId}): ${piecesByPlayer[playerId].length} pieces`);
						
						piecesByPlayer[playerId].forEach(piece => {
							console.log(`    - ${piece.type} at position: (${piece.x}, ${piece.y})`);
						});
					});
					
					// Log raw data for debugging
					console.log(`Raw chess pieces array: ${JSON.stringify(gameState.chessPieces).substring(0, 500)}...`);
					console.log(`Raw players array: ${JSON.stringify(gameState.players).substring(0, 500)}...`);
				} else {
					console.log('No chess pieces found in game state');
				}
			} else {
				console.log('Invalid game state format received');
			}
			
			return gameState;
		} else {
			console.log(`❌ Failed to retrieve game state: ${response.status} ${response.statusText}`);
			return null;
		}
	} catch (error) {
		console.log(`❌ Error retrieving game state: ${error.message}`);
		return null;
	}
}

/**
 * Get available tetrominos from the server
 * @returns {Array} Array of available tetrominos
 */
async function getAvailableTetrominos() {
	try {
		if (!gameId) return [];
		
		const response = await axios.get(`${API_URL}/games/${gameId}/available-tetrominos`, {
			params: {
				playerId,
				apiToken
			}
		});
		
		if (response.data.success) {
			console.log(`Available tetrominos: ${JSON.stringify(response.data.tetrominos)}`);
			return response.data.tetrominos;
		} else {
			console.error('Failed to get available tetrominos:', response.data.message);
			return [];
		}
	} catch (error) {
		console.error('Error getting available tetrominos:', error.message);
		return [];
	}
}

/**
 * Get chess pieces for this player
 */
async function getChessPieces() {
	try {
		if (!gameId) return [];
		
		const response = await axios.get(
			`${API_URL}/games/${gameId}/chess-pieces?playerId=${playerId}&apiToken=${apiToken}`
		);
		
		if (response.data.success) {
			return response.data.chessPieces;
		} else {
			console.error('Failed to get chess pieces:', response.data.message);
			return [];
		}
	} catch (error) {
		console.error('Error getting chess pieces:', error.response?.data || error.message);
		return [];
	}
}

/**
 * Make a move (tetromino or chess)
 * @param {string} moveType - 'tetromino' or 'chess'
 * @param {Object} moveData - Move data
 */
async function makeMove(moveType, moveData) {
	// Enforce minimum time between moves
	const now = Date.now();
	const timeSinceLastMove = now - lastMoveTime;
	const minMoveInterval = 10 * 1000; // 10 seconds
	
	if (timeSinceLastMove < minMoveInterval) {
		const waitTime = minMoveInterval - timeSinceLastMove;
		console.log(`Waiting ${waitTime}ms before next move...`);
		await new Promise(resolve => setTimeout(resolve, waitTime));
	}
	
	const gameState = await getGameState();
	if (!gameState) return false;
	
	const player = gameState.players.find(p => p.id === playerId);
	console.log('Player data:', player);
	
	const currentMoveType = gameState.currentMoveType;
	console.log('Current move type:', currentMoveType);
	
	if (currentMoveType === 'tetromino') {
		console.log('Making a tetromino move...');
		const availableTetrominos = gameState.availableTetrominos || [];
		console.log('Available tetrominos:', availableTetrominos);
		
		// Get available tetrominos from server
		const tetrominos = await getAvailableTetrominos();
		console.log('Available tetrominos from server:', tetrominos);
		
		// Find our king's position for reference
		const ourPieces = gameState.chessPieces.filter(piece => piece.player === playerId);
		const king = ourPieces.find(piece => piece.type === 'king');
		
		let kingX = 10, kingY = 10; // Default position
		if (king) {
			kingX = king.x;
			kingY = king.y;
			console.log(`Found king at position (${kingX}, ${kingY})`);
		} else {
			console.log(`King not found for player ${playerId}, using default position`);
		}
		
		// Choose a tetromino and rotation
		const tetromino = tetrominos[0] || { shape: 'I', rotations: 4 };
		const rotation = Math.floor(Math.random() * tetromino.rotations);
		console.log(`Using server tetromino: ${tetromino.shape} with rotation ${rotation}`);
		
		// Find a valid placement
		const placement = await findBestTetrominoPlacement(gameState, playerId);
		if (!placement) {
			console.log('No valid tetromino placement found, using default');
			return await placeTetrominoPiece(tetromino.shape, rotation, kingX, kingY - 2);
		}
		
		console.log(`Found valid tetromino placement at (${placement.x}, ${placement.y})`);
		return await placeTetrominoPiece(
			placement.type || tetromino.shape,
			placement.rotation || rotation,
			placement.x || placement.position.x,
			placement.y || placement.position.y
		);
	} else if (currentMoveType === 'chess') {
		console.log('Making a chess move...');
		
		// Find our chess pieces
		const ourPieces = gameState.chessPieces.filter(piece => piece.player === playerId);
		console.log(`Found ${ourPieces.length} chess pieces for player ${playerId}`);
		
		if (ourPieces.length === 0) {
			console.log('No chess pieces found for our player, skipping move');
			return await skipChessMove();
		}
		
		// Find the best move
		const move = await findBestChessMove(gameState, playerId);
		
		if (!move) {
			console.log('No valid chess move found. Trying to skip to tetromino move...');
			return await skipChessMove();
		}
		
		console.log(`\n=== CHESS MOVE ===`);
		console.log(`Piece: ${move.piece.type}`);
		console.log(`From: (${move.fromX}, ${move.fromY})`);
		console.log(`To: (${move.toX}, ${move.toY})`);
		console.log(`Move distance: ${Math.abs(move.toX - move.fromX) + Math.abs(move.toY - move.fromY)}`);
		
		// Format the move data for the API
		const moveData = {
			pieceId: move.piece.id,
			fromX: move.fromX,
			fromY: move.fromY,
			toX: move.toX,
			toY: move.toY
		};
		
		console.log(`Sending chess move data: ${JSON.stringify(moveData)}`);
		
		try {
			const response = await fetch(`${API_URL}/games/${gameId}/computer-move`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					playerId,
					apiToken,
					moveType: 'chess',
					moveData
				})
			});
			
			if (response.ok) {
				const result = await response.json();
				console.log('✅ CHESS move successful!');
				console.log(`Next turn: ${result.nextTurn === playerId ? 'Our turn' : 'Opponent\'s turn'}`);
				console.log(`Next move type: ${result.nextMoveType}`);
				console.log(`Game status: ${result.status}`);
				lastMoveTime = Date.now();
				moveCount++;
				return true;
			} else {
				const errorText = await response.text();
				console.log(`❌ Error making chess move: ${errorText}`);
				console.log('\nChess move failed. Trying to skip to tetromino move...');
				return await skipChessMove();
			}
		} catch (error) {
			console.log(`❌ Error making chess move: ${error.message}`);
			console.log('\nChess move failed. Trying to skip to tetromino move...');
			return await skipChessMove();
		}
	} else {
		console.log(`Unknown move type: ${currentMoveType}`);
		return false;
	}
}

/**
 * Find the best position to place a tetromino
 * @param {Object} gameState - Current game state
 * @param {string} playerId - ID of the player
 * @returns {Object} - Best position for tetromino placement
 */
async function findBestTetrominoPlacement(gameState, playerId) {
	// Check if gameState has the expected structure
	if (!gameState || !playerId) {
		console.log('Invalid gameState or playerId in findBestTetrominoPlacement');
		return null;
	}
	
	// Get available tetrominos from the server
	const availableTetrominos = await getAvailableTetrominos();
	console.log(`Available tetrominos from server: ${JSON.stringify(availableTetrominos)}`);
	
	// Try to find the player in different ways
	let player = null;
	
	if (gameState.players) {
		if (Array.isArray(gameState.players)) {
			player = gameState.players.find(p => p.id === playerId);
		} else if (typeof gameState.players === 'object') {
			player = gameState.players[playerId];
		}
	}
	
	if (!player) {
		console.log(`Player ${playerId} not found in gameState`);
		return null;
	}
	
	// Get the king position
	const kingPosition = findKingPosition(gameState, playerId);
	if (!kingPosition) {
		console.log('King position not found, cannot determine best tetromino placement');
		// Return a default placement in the middle of the board
		return {
			pieceType: 'I',
			type: 'I',
			rotation: 0,
			x: 10,
			y: 10,
			position: { x: 10, y: 10 }
		};
	}
	
	// Use available tetrominos from the server if available, otherwise fallback to defaults
	if (!availableTetrominos || availableTetrominos.length === 0) {
		console.log('No available tetrominos found, using default');
		return {
			pieceType: 'I',
			type: 'I',
			rotation: 0,
			x: kingPosition.x,
			y: kingPosition.y - 2,
			position: { x: kingPosition.x, y: kingPosition.y - 2 }
		};
	}
	
	// Choose a tetromino from available ones
	const randomIndex = Math.floor(Math.random() * availableTetrominos.length);
	const chosenTetromino = availableTetrominos[randomIndex];
	
	// Get rotation limit for this shape
	const maxRotation = chosenTetromino.rotations || 4;
	const randomRotation = Math.floor(Math.random() * maxRotation);
	
	console.log(`Using server tetromino: ${chosenTetromino.shape} with rotation ${randomRotation}`);
	
	// For simplicity, place the tetromino near the king
	// In a real implementation, you would check for valid placements
	// based on the board state and connectivity rules
	
	// Try to place near the king first
	const possiblePositions = [
		{ x: kingPosition.x, y: kingPosition.y - 2 },     // Above
		{ x: kingPosition.x + 2, y: kingPosition.y },     // Right
		{ x: kingPosition.x, y: kingPosition.y + 2 },     // Below
		{ x: kingPosition.x - 2, y: kingPosition.y },     // Left
		{ x: kingPosition.x + 1, y: kingPosition.y - 1 }, // Top-right
		{ x: kingPosition.x + 1, y: kingPosition.y + 1 }, // Bottom-right
		{ x: kingPosition.x - 1, y: kingPosition.y + 1 }, // Bottom-left
		{ x: kingPosition.x - 1, y: kingPosition.y - 1 }  // Top-left
	];
	
	// Visualize the board with the king's position
	visualizeBoard(gameState, kingPosition);
	
	// Return the tetromino placement
	return {
		pieceType: chosenTetromino.shape,
		type: chosenTetromino.shape,
		shape: chosenTetromino.shape,
		rotation: randomRotation,
		x: kingPosition.x,
		y: kingPosition.y - 2,
		position: { x: kingPosition.x, y: kingPosition.y - 2 }
	};
}

/**
 * Find the position of the king for a player
 * @param {Object} gameState - Current game state
 * @param {string} playerId - ID of the player
 * @returns {Object|null} - Position of the king or null if not found
 */
function findKingPosition(gameState, playerId) {
	// Check if gameState has the expected structure
	if (!gameState || !playerId) {
		console.log('Invalid gameState or playerId in findKingPosition');
		return null;
	}
	
	// Try to find the king in the chess pieces array
	if (gameState.chessPieces && Array.isArray(gameState.chessPieces)) {
		const king = gameState.chessPieces.find(piece => piece.player === playerId && piece.type === 'king');
		if (king) {
			if (typeof king.x === 'number' && typeof king.y === 'number') {
				console.log(`Found king at position (${king.x}, ${king.y})`);
				return { x: king.x, y: king.y };
			} else if (king.position && typeof king.position.x === 'number' && typeof king.position.y === 'number') {
				console.log(`Found king at position (${king.position.x}, ${king.position.y})`);
				return king.position;
			}
		}
	}
	
	// Try to find the player in different ways
	let player = null;
	
	if (gameState.players) {
		if (Array.isArray(gameState.players)) {
			player = gameState.players.find(p => p.id === playerId);
		} else if (typeof gameState.players === 'object') {
			player = gameState.players[playerId];
		}
	}
	
	if (player) {
		// Try to find the king in the player's pieces
		if (player.pieces && Array.isArray(player.pieces)) {
			const king = player.pieces.find(piece => piece.type === 'king');
			if (king) {
				if (typeof king.x === 'number' && typeof king.y === 'number') {
					console.log(`Found king at position (${king.x}, ${king.y})`);
					return { x: king.x, y: king.y };
				} else if (king.position && typeof king.position.x === 'number' && typeof king.position.y === 'number') {
					console.log(`Found king at position (${king.position.x}, ${king.position.y})`);
					return king.position;
				}
			}
		}
		
		// Try to find king position in homeZone
		if (player.homeZone && player.homeZone.kingPosition) {
			console.log(`Found king position in home zone: (${player.homeZone.kingPosition.x}, ${player.homeZone.kingPosition.y})`);
			return player.homeZone.kingPosition;
		}
	}
	
	// If we still can't find the king, use a default position
	console.log(`King not found for player ${playerId}, using default position`);
	return { x: 10, y: 10 }; // Default position in the middle of the board
}

/**
 * Check if a tetromino placement is valid
 * @param {Object} board - Game board
 * @param {Object} tetromino - Tetromino to place
 * @param {number} x - X position
 * @param {number} y - Y position
 * @returns {boolean} - Whether the placement is valid
 */
function isValidTetrominoPlacement(board, tetromino, x, y) {
	// Get the shape of the tetromino based on its type and rotation
	const shape = getTetrominoShape(tetromino.type, tetromino.rotation);
	if (!shape) return false;
	
	// Check if the tetromino fits within the board boundaries
	for (let i = 0; i < shape.length; i++) {
		for (let j = 0; j < shape[i].length; j++) {
			if (shape[i][j] === 0) continue; // Empty cell
			
			const boardX = x + j;
			const boardY = y + i;
			
			// Check if out of bounds
			if (boardX < 0 || boardX >= board.width || boardY < 0 || boardY >= board.height) {
				return false;
			}
			
			// Check if cell is already occupied
			const cell = board.cells.find(c => c.x === boardX && c.y === boardY);
			if (cell && cell.occupied) {
				return false;
			}
		}
	}
	
	return true;
}

/**
 * Get the shape of a tetromino based on its type and rotation
 * @param {string} type - Type of tetromino (I, J, L, O, S, T, Z)
 * @param {number} rotation - Rotation (0-3)
 * @returns {Array} - 2D array representing the shape
 */
function getTetrominoShape(type, rotation) {
	// Define tetromino shapes
	const shapes = {
		I: [
			[[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
			[[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
			[[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]],
			[[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]]
		],
		J: [
			[[1, 0, 0], [1, 1, 1], [0, 0, 0]],
			[[0, 1, 1], [0, 1, 0], [0, 1, 0]],
			[[0, 0, 0], [1, 1, 1], [0, 0, 1]],
			[[0, 1, 0], [0, 1, 0], [1, 1, 0]]
		],
		L: [
			[[0, 0, 1], [1, 1, 1], [0, 0, 0]],
			[[0, 1, 0], [0, 1, 0], [0, 1, 1]],
			[[0, 0, 0], [1, 1, 1], [1, 0, 0]],
			[[1, 1, 0], [0, 1, 0], [0, 1, 0]]
		],
		O: [
			[[1, 1], [1, 1]],
			[[1, 1], [1, 1]],
			[[1, 1], [1, 1]],
			[[1, 1], [1, 1]]
		],
		S: [
			[[0, 1, 1], [1, 1, 0], [0, 0, 0]],
			[[0, 1, 0], [0, 1, 1], [0, 0, 1]],
			[[0, 0, 0], [0, 1, 1], [1, 1, 0]],
			[[1, 0, 0], [1, 1, 0], [0, 1, 0]]
		],
		T: [
			[[0, 1, 0], [1, 1, 1], [0, 0, 0]],
			[[0, 1, 0], [0, 1, 1], [0, 1, 0]],
			[[0, 0, 0], [1, 1, 1], [0, 1, 0]],
			[[0, 1, 0], [1, 1, 0], [0, 1, 0]]
		],
		Z: [
			[[1, 1, 0], [0, 1, 1], [0, 0, 0]],
			[[0, 0, 1], [0, 1, 1], [0, 1, 0]],
			[[0, 0, 0], [1, 1, 0], [0, 1, 1]],
			[[0, 1, 0], [1, 1, 0], [1, 0, 0]]
		]
	};
	
	// Return the shape for the given type and rotation
	return shapes[type] ? shapes[type][rotation % 4] : null;
}

/**
 * Find the best chess move for the current player
 * @param {Object} gameState - The current game state
 * @param {string} playerId - The player's ID
 * @returns {Promise<Object|null>} - The best chess move or null if no valid move is found
 */
async function findBestChessMove(gameState, playerId) {
	console.log(`Found ${gameState.chessPieces.filter(piece => piece.player === playerId).length} chess pieces for player ${playerId}`);
	
	// Filter chess pieces to only include those belonging to the current player
	const myPieces = gameState.chessPieces.filter(piece => piece.player === playerId);
	if (!myPieces || myPieces.length === 0) {
		console.log('No chess pieces found for the current player');
		return null;
	}
	
	// Find all valid moves for each piece
	let allMoves = [];
	
	for (const piece of myPieces) {
		console.log(`Checking moves for ${piece.type} at (${piece.x}, ${piece.y})`);
		
		// Get valid moves for this piece
		const validMoves = getValidMovesForPiece(piece, gameState);
		console.log(`Found ${validMoves.length} valid moves for ${piece.type}`);
		
		if (validMoves.length > 0) {
			// Add the piece and valid moves to our list
			allMoves.push(...validMoves.map(move => ({
				piece: piece,
				fromX: piece.x,
				fromY: piece.y,
				toX: move.x,
				toY: move.y
			})));
		}
	}
	
	if (allMoves.length === 0) {
		console.log('No valid moves found for any piece');
		return null;
	}
	
	// Find opponent's king to target
	const opponentPieces = gameState.chessPieces.filter(piece => piece.player !== playerId);
	const opponentKings = opponentPieces.filter(piece => piece.type === 'king');
	
	let targetX, targetY;
	
	if (opponentKings.length > 0) {
		// Target the closest opponent king
		const closestKing = opponentKings[0]; // Just pick the first one for simplicity
		targetX = closestKing.x;
		targetY = closestKing.y;
		console.log(`Targeting opponent king at (${targetX}, ${targetY})`);
	} else {
		// If no opponent king found, target the center of the board
		targetX = Math.floor(gameState.boardWidth / 2);
		targetY = Math.floor(gameState.boardHeight / 2);
		console.log(`No opponent king found, targeting center at (${targetX}, ${targetY})`);
	}
	
	// Sort moves by distance to target (ascending)
	allMoves.sort((a, b) => {
		const distA = Math.abs(a.toX - targetX) + Math.abs(a.toY - targetY);
		const distB = Math.abs(b.toX - targetX) + Math.abs(b.toY - targetY);
		return distA - distB;
	});
	
	// Pick the best move (closest to target)
	const bestMove = allMoves[0];
	console.log(`Best move for ${bestMove.piece.type}: (${bestMove.fromX}, ${bestMove.fromY}) -> (${bestMove.toX}, ${bestMove.toY})`);
	
	return bestMove;
}

/**
 * Visualize the board as ASCII art with improved clarity
 * @param {Object} gameState - Current game state
 * @param {Object} highlightPos - Position to highlight (optional)
 */
function visualizeBoard(gameState, highlightPos) {
	if (!gameState || !gameState.board) {
		console.log("No board data available for visualization");
		return;
	}

	const board = gameState.board;
	const width = board.width || 20;
	const height = board.height || 20;
	const cells = board.cells || [];
	const chessPieces = gameState.chessPieces || [];
	
	// Create a 2D array to represent the board
	const boardArray = Array(height).fill().map(() => Array(width).fill('.'));
	
	// Mark home zones
	const homeZones = gameState.homeZones || [];
	homeZones.forEach(zone => {
		if (zone && zone.cells) {
			zone.cells.forEach(cell => {
				if (cell && typeof cell.x === 'number' && typeof cell.y === 'number') {
					const x = cell.x;
					const y = cell.y;
					if (x >= 0 && x < width && y >= 0 && y < height) {
						// Use uppercase H for the player's home zone, lowercase h for others
						boardArray[y][x] = zone.player === playerId ? 'H' : 'h';
					}
				}
			});
		}
	});
	
	// Place tetrominos on the board
	cells.forEach(cell => {
		if (cell && cell.hasTetromino && typeof cell.x === 'number' && typeof cell.y === 'number') {
			const x = cell.x;
			const y = cell.y;
			if (x >= 0 && x < width && y >= 0 && y < height) {
				boardArray[y][x] = '#';
			}
		}
	});
	
	// Place chess pieces on the board
	chessPieces.forEach(piece => {
		if (piece && piece.type && typeof piece.x === 'number' && typeof piece.y === 'number') {
			const x = piece.x;
			const y = piece.y;
			if (x >= 0 && x < width && y >= 0 && y < height) {
				let symbol = '';
				switch (piece.type) {
					case 'king': symbol = 'K'; break;
					case 'queen': symbol = 'Q'; break;
					case 'rook': symbol = 'R'; break;
					case 'bishop': symbol = 'B'; break;
					case 'knight': symbol = 'N'; break;
					case 'pawn': symbol = 'P'; break;
					default: symbol = '?';
				}
				// Use uppercase for the player's pieces, lowercase for others
				boardArray[y][x] = piece.player === playerId ? symbol : symbol.toLowerCase();
			}
		}
	});
	
	// Add highlight if provided
	if (highlightPos && typeof highlightPos.x === 'number' && typeof highlightPos.y === 'number') {
		const x = highlightPos.x;
		const y = highlightPos.y;
		if (x >= 0 && x < width && y >= 0 && y < height) {
			boardArray[y][x] = '*';
		}
	}
	
	// Print the board
	console.log("\n=== GAME BOARD VISUALIZATION ===");
	
	// Print column numbers
	console.log("   " + Array.from({length: width}, (_, i) => i % 10).join(" "));
	
	// Print top border
	console.log("  +" + "-".repeat(width * 2) + "+");
	
	// Print rows with row numbers
	for (let y = 0; y < height; y++) {
		console.log(`${y % 10} |${boardArray[y].join(" ")}|`);
	}
	
	// Print bottom border
	console.log("  +" + "-".repeat(width * 2) + "+");
	
	// Print legend
	console.log("Legend: K/k=King, Q/q=Queen, R/r=Rook, B/b=Bishop, N/n=Knight, P/p=Pawn");
	console.log("        H/h=Home zone, #/==Tetromino, *=Highlight, .=Empty");
	console.log("        (Uppercase = focused player, lowercase = other players)");
	console.log("================================\n");
}

/**
 * Get server-side visualization of the game board
 * @param {Object} options - Visualization options
 * @returns {Promise<Object>} - Visualization data
 */
async function getServerVisualization(options = {}) {
	try {
		if (!gameId) {
			console.log('No game ID available for visualization');
			return null;
		}
		
		// Build query parameters
		const queryParams = new URLSearchParams({
			playerId,
			...options
		}).toString();
		
		const response = await axios.get(`${API_URL}/games/${gameId}/visualization?${queryParams}`);
		
		if (response.data.success) {
			return response.data;
		} else {
			console.error('Failed to get visualization:', response.data.message);
			return null;
		}
	} catch (error) {
		console.error('Error getting visualization:', error.message);
		return null;
	}
}

/**
 * Display server-side visualization
 * @param {Object} options - Visualization options
 */
async function displayServerVisualization(options = {}) {
	const visualizationData = await getServerVisualization(options);
	
	if (!visualizationData) {
		console.log('No visualization data available');
		return;
	}
	
	// Display the visualizations
	if (visualizationData.visualization) {
		console.log(visualizationData.visualization);
	}
	
	if (visualizationData.homeZoneVisualization) {
		console.log(visualizationData.homeZoneVisualization);
	}
	
	if (visualizationData.gameSummary) {
		console.log(visualizationData.gameSummary);
	}
}

/**
 * Main game loop
 */
async function gameLoop() {
	// Check if we've reached the maximum number of moves
	if (moveCount >= MAX_MOVES) {
		console.log(`Reached maximum number of moves (${MAX_MOVES}). Exiting.`);
		process.exit(0);
	}
	
	try {
		// If we don't have a player ID yet, register first
		if (!playerId) {
			console.log('No player ID found. Registering player...');
			const registered = await registerPlayer();
			if (!registered) {
				console.error('Failed to register player. Retrying in 5 seconds...');
				setTimeout(gameLoop, 5000);
				return;
			}
		}
		
		// If we don't have a game ID yet, join a game
		if (!gameId) {
			console.log('No game ID found. Joining or creating a game...');
			try {
				const gameState = await joinGame();
				if (gameState) {
					// Use the gameId from the response or from the gameState object
					if (!gameId) {
						// If gameId wasn't set in joinGame, try to get it from gameState
						gameId = gameState.id || gameState.gameId;
					}
					
					if (gameId) {
						console.log(`Successfully joined game ${gameId}`);
						
						// Display the initial game state visualization
						await displayServerVisualization();
					} else {
						console.error('Failed to get game ID from response. Retrying in 5 seconds...');
						console.log('Game state:', JSON.stringify(gameState).substring(0, 200));
						setTimeout(gameLoop, 5000);
						return;
					}
				} else {
					console.error('Failed to join a game. Retrying in 5 seconds...');
					setTimeout(gameLoop, 5000);
					return;
				}
			} catch (error) {
				console.error('Error joining game:', error);
				setTimeout(gameLoop, 5000);
				return;
			}
		}
		
		// Get the current game state
		const gameState = await getGameState();
		
		if (!gameState) {
			console.log('Failed to get game state. Retrying in 2 seconds...');
			setTimeout(gameLoop, 2000);
			return;
		}
		
		// Print detailed game state information
		await printGameState();
		
		// Display server-side visualization
		await displayServerVisualization();
		
		// Log the game state structure to debug
		console.log('Game state structure:', JSON.stringify(gameState, null, 2).substring(0, 500) + '...');
		
		// Check what move type is expected
		let player = null;
		
		// Try different ways to find the player in the game state
		if (gameState.players) {
			if (Array.isArray(gameState.players)) {
				player = gameState.players.find(p => p.id === playerId);
			} else if (typeof gameState.players === 'object') {
				player = gameState.players[playerId];
			}
		}
		
		if (!player) {
			console.log(`Player ${playerId} not found in game state. Retrying in 2 seconds...`);
			console.log('Available players:', Object.keys(gameState.players || {}));
			setTimeout(gameLoop, 2000);
			return;
		}
		
		console.log('Player data:', JSON.stringify(player, null, 2));
		
		// Determine the move type - check both player-specific and game-wide move type
		let moveType = player.currentMoveType;
		if (!moveType) {
			// If player doesn't have a move type, check the game's current move type
			moveType = gameState.currentMoveType;
		}
		
		// Default to tetromino if still not specified
		if (!moveType) {
			moveType = 'tetromino';
		}
		
		console.log(`Current move type: ${moveType}`);
		
		// Make the appropriate move based on the move type
		if (moveType === 'tetromino') {
			console.log('Making a tetromino move...');
			const tetrominoMove = await findBestTetrominoPlacement(gameState, playerId);
			
			if (tetrominoMove) {
				// Convert the tetromino move to the format expected by the API
				const apiMoveData = {
					pieceType: tetrominoMove.pieceType || tetrominoMove.type,
					type: tetrominoMove.pieceType || tetrominoMove.type,
					shape: tetrominoMove.pieceType || tetrominoMove.type,
					rotation: tetrominoMove.rotation,
					x: tetrominoMove.x || tetrominoMove.position.x,
					y: tetrominoMove.y || tetrominoMove.position.y,
					position: tetrominoMove.position
				};
				
				console.log('Sending tetromino move data:', JSON.stringify(apiMoveData));
				
				// Display visualization with the planned move highlighted
				await displayServerVisualization({
					highlightX: apiMoveData.x,
					highlightY: apiMoveData.y
				});
				
				const success = await makeMove('tetromino', apiMoveData);
				
				if (success) {
					console.log('Tetromino move successful');
					moveCount++;
					
					// Display updated visualization after the move
					await displayServerVisualization();
				} else {
					console.log('Tetromino move failed. Retrying in 2 seconds...');
					setTimeout(gameLoop, 2000);
					return;
				}
			} else {
				console.log('No valid tetromino move found. Retrying in 2 seconds...');
				setTimeout(gameLoop, 2000);
				return;
			}
		} else if (moveType === 'chess') {
			console.log('Making a chess move...');
			const chessMove = await findBestChessMove(gameState, playerId);
			
			if (chessMove) {
				// Convert the chess move to the format expected by the API
				const apiMoveData = {
					pieceId: chessMove.piece.id,
					fromX: chessMove.fromX,
					fromY: chessMove.fromY,
					toX: chessMove.toX,
					toY: chessMove.toY
				};
				
				console.log('Sending chess move data:', JSON.stringify(apiMoveData));
				
				// Display visualization with the planned move highlighted
				await displayServerVisualization({
					highlightX: apiMoveData.toX,
					highlightY: apiMoveData.toY
				});
				
				const success = await makeMove('chess', apiMoveData);
				
				if (success) {
					console.log('Chess move successful');
					moveCount++;
					
					// Display updated visualization after the move
					await displayServerVisualization();
				} else {
					console.log('Chess move failed. Trying to skip to tetromino move...');
					const skipResult = await skipChessMove();
					
					if (!skipResult.success) {
						console.log('Failed to skip chess move. Retrying in 2 seconds...');
						setTimeout(gameLoop, 2000);
						return;
					}
				}
			} else {
				console.log('No valid chess move found. Trying to skip to tetromino move...');
				const skipResult = await skipChessMove();
				
				if (!skipResult.success) {
					console.log('Failed to skip chess move. Retrying in 2 seconds...');
					setTimeout(gameLoop, 2000);
					return;
				}
			}
		} else {
			console.log(`Unknown move type: ${moveType}. Retrying in 2 seconds...`);
			setTimeout(gameLoop, 2000);
			return;
		}
		
		// Continue the game loop after a short delay
		setTimeout(gameLoop, 2000);
	} catch (error) {
		console.error('Error in game loop:', error);
		setTimeout(gameLoop, 2000);
	}
}

/**
 * Skip the chess move when no valid moves are available
 * @returns {Promise<Object>} Result of the skip operation
 */
async function skipChessMove() {
	try {
		const response = await fetch(`${API_URL}/games/${gameId}/computer-move`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				playerId,
				apiToken,
				moveType: 'chess',
				moveData: {
					skipMove: true
				}
			})
		});
		
		if (response.ok) {
			const responseData = await response.json();
			console.log('✅ Chess move skipped!');
			return true;
		} else {
			const errorText = await response.text();
			console.log(`❌ Error skipping chess move: ${errorText}`);
			return false;
		}
	} catch (error) {
		console.log(`❌ Error skipping chess move: ${error.message}`);
		return false;
	}
}

/**
 * Start the computer player
 */
function start() {
	console.log('Starting Shaktris computer player...');
	console.log(`Player name: ${PLAYER_NAME}`);
	console.log(`API URL: ${API_URL}`);
	console.log(`API Endpoint: ${API_ENDPOINT}`);
	
	// Start the game loop
	gameLoop().catch(console.error);
}

// Start the computer player if this file is executed directly
if (require.main === module) {
	start();
}

module.exports = {
	start,
	registerPlayer,
	joinGame,
	makeMove,
	getAvailableTetrominos,
	getChessPieces,
	placeTetrominoPiece
};

/**
 * Get a more detailed view of the game state
 */
async function printGameState() {
	const gameState = await getGameState();
	if (!gameState) {
		console.log("Game state not available");
		return;
	}
	
	console.log("\n=== GAME STATE SUMMARY ===");
	console.log(`Game ID: ${gameId}`);
	console.log(`Status: ${gameState.status || 'Unknown'}`);
	console.log(`Current Turn: ${gameState.currentTurn === playerId ? 'Our Turn' : 'Opponent Turn'}`);
	console.log(`Current Move Type: ${gameState.currentMoveType || 'Unknown'}`);
	
	// Print players - handle both array and object formats
	console.log("\nPlayers:");
	if (gameState.players) {
		const playersList = Array.isArray(gameState.players) 
			? gameState.players 
			: Object.values(gameState.players);
		
		playersList.forEach(player => {
			if (player) {
				console.log(`- ${player.username || player.name || 'Unknown'} (${player.id})${player.id === playerId ? ' (us)' : ''}`);
			}
		});
	} else {
		console.log("No players found in game state");
	}
	
	// Print chess pieces by player
	console.log("\nChess Pieces:");
	if (gameState.chessPieces && gameState.chessPieces.length > 0) {
		// Group chess pieces by player
		const piecesByPlayer = {};
		gameState.chessPieces.forEach(piece => {
			if (!piecesByPlayer[piece.player]) {
				piecesByPlayer[piece.player] = [];
			}
			piecesByPlayer[piece.player].push(piece);
		});
		
		// Log each player's pieces
		Object.keys(piecesByPlayer).forEach(pid => {
			const playerName = gameState.players?.find?.(p => p.id === pid)?.name || 'Unknown';
			console.log(`  Player ${playerName} (${pid})${pid === playerId ? ' (us)' : ''}:`);
			piecesByPlayer[pid].forEach(piece => {
				console.log(`    - ${piece.type} at position: (${piece.x}, ${piece.y})`);
			});
		});
	} else {
		console.log("  No chess pieces found in game state");
	}
	
	// Print our available tetrominos
	console.log("\nAvailable Tetrominos:");
	const tetrominos = gameState.availableTetrominos?.[playerId] || [];
	if (tetrominos.length > 0) {
		tetrominos.forEach(tetromino => {
			console.log(`- ${tetromino.shape} (${tetromino.rotations} rotations)`);
		});
	} else {
		// Try to find tetrominos in a different format
		const allTetrominos = gameState.availableTetrominos || [];
		if (Array.isArray(allTetrominos) && allTetrominos.length > 0) {
			allTetrominos.forEach(tetromino => {
				console.log(`- ${tetromino.shape} (${tetromino.rotations} rotations)`);
			});
		} else {
			console.log("No tetrominos found for our player");
		}
	}
	
	// Print last tetromino placement
	console.log("\nLast Tetromino Placement:");
	// Try to find player in different formats
	const player = Array.isArray(gameState.players) 
		? gameState.players.find(p => p?.id === playerId)
		: gameState.players?.[playerId];
	
	if (player && player.lastTetrominoPlacement) {
		const placement = player.lastTetrominoPlacement;
		console.log(`- Shape: ${placement.shape}`);
		console.log(`- Rotation: ${placement.rotation}`);
		if (placement.position) {
			console.log(`- Position: (${placement.position.x}, ${placement.position.y})`);
		} else if (typeof placement.x === 'number' && typeof placement.y === 'number') {
			console.log(`- Position: (${placement.x}, ${placement.y})`);
		} else {
			console.log("- Position: unknown");
		}
	} else {
		console.log("- No previous placement");
	}
	
	console.log("================================\n");
}

/**
 * Get valid moves for a chess piece
 * @param {Object} piece - The chess piece
 * @param {Object} gameState - Current game state
 * @returns {Array} Array of valid move positions
 */
function getValidMovesForPiece(piece, gameState) {
	if (!piece || typeof piece.x !== 'number' || typeof piece.y !== 'number') {
		return [];
	}

	const board = gameState.board || { width: 20, height: 20 };
	const width = board.width || 20;
	const height = board.height || 20;
	const cells = board.cells || [];
	const chessPieces = gameState.chessPieces || [];
	
	// Create a map to represent the board occupancy
	const occupiedCells = {};
	
	// Mark cells occupied by chess pieces
	chessPieces.forEach(p => {
		if (p && typeof p.x === 'number' && typeof p.y === 'number') {
			const key = `${p.x},${p.y}`;
			occupiedCells[key] = p;
		}
	});
	
	// Get valid moves for the piece
	const validMoves = [];
	
	// Define movement patterns based on piece type
	let movePatterns = [];
	
	switch (piece.type.toLowerCase()) {
		case 'king':
			// King can move one square in any direction
			movePatterns = [
				{ dx: 1, dy: 0, steps: 1 },
				{ dx: -1, dy: 0, steps: 1 },
				{ dx: 0, dy: 1, steps: 1 },
				{ dx: 0, dy: -1, steps: 1 },
				{ dx: 1, dy: 1, steps: 1 },
				{ dx: 1, dy: -1, steps: 1 },
				{ dx: -1, dy: 1, steps: 1 },
				{ dx: -1, dy: -1, steps: 1 }
			];
			break;
		case 'queen':
			// Queen can move any number of squares in any direction
			movePatterns = [
				{ dx: 1, dy: 0, steps: Infinity },
				{ dx: -1, dy: 0, steps: Infinity },
				{ dx: 0, dy: 1, steps: Infinity },
				{ dx: 0, dy: -1, steps: Infinity },
				{ dx: 1, dy: 1, steps: Infinity },
				{ dx: 1, dy: -1, steps: Infinity },
				{ dx: -1, dy: 1, steps: Infinity },
				{ dx: -1, dy: -1, steps: Infinity }
			];
			break;
		case 'rook':
			// Rook can move any number of squares horizontally or vertically
			movePatterns = [
				{ dx: 1, dy: 0, steps: Infinity },
				{ dx: -1, dy: 0, steps: Infinity },
				{ dx: 0, dy: 1, steps: Infinity },
				{ dx: 0, dy: -1, steps: Infinity }
			];
			break;
		case 'bishop':
			// Bishop can move any number of squares diagonally
			movePatterns = [
				{ dx: 1, dy: 1, steps: Infinity },
				{ dx: 1, dy: -1, steps: Infinity },
				{ dx: -1, dy: 1, steps: Infinity },
				{ dx: -1, dy: -1, steps: Infinity }
			];
			break;
		case 'knight':
			// Knight moves in an L-shape
			movePatterns = [
				{ dx: 2, dy: 1, steps: 1 },
				{ dx: 2, dy: -1, steps: 1 },
				{ dx: -2, dy: 1, steps: 1 },
				{ dx: -2, dy: -1, steps: 1 },
				{ dx: 1, dy: 2, steps: 1 },
				{ dx: 1, dy: -2, steps: 1 },
				{ dx: -1, dy: 2, steps: 1 },
				{ dx: -1, dy: -2, steps: 1 }
			];
			break;
		case 'pawn':
			// Pawn moves forward one square
			// For simplicity, we'll allow pawns to move in any direction
			// In a real implementation, you would check the player's orientation
			movePatterns = [
				{ dx: 0, dy: 1, steps: 1 },
				{ dx: 0, dy: -1, steps: 1 },
				{ dx: 1, dy: 0, steps: 1 },
				{ dx: -1, dy: 0, steps: 1 }
			];
			break;
		default:
			// Default to queen-like movement for unknown piece types
			movePatterns = [
				{ dx: 1, dy: 0, steps: Infinity },
				{ dx: -1, dy: 0, steps: Infinity },
				{ dx: 0, dy: 1, steps: Infinity },
				{ dx: 0, dy: -1, steps: Infinity },
				{ dx: 1, dy: 1, steps: Infinity },
				{ dx: 1, dy: -1, steps: Infinity },
				{ dx: -1, dy: 1, steps: Infinity },
				{ dx: -1, dy: -1, steps: Infinity }
			];
	}
	
	// Check each move pattern
	for (const pattern of movePatterns) {
		const { dx, dy, steps } = pattern;
		
		// Move in the pattern direction for the specified number of steps
		for (let step = 1; step <= steps; step++) {
			const newX = piece.x + dx * step;
			const newY = piece.y + dy * step;
			
			// Check if the new position is within the board
			if (newX < 0 || newX >= width || newY < 0 || newY >= height) {
				break; // Out of bounds, stop in this direction
			}
			
			const key = `${newX},${newY}`;
			const occupant = occupiedCells[key];
			
			if (occupant) {
				// If the cell is occupied by an opponent's piece, we can capture it
				if (occupant.player !== piece.player) {
					validMoves.push({ x: newX, y: newY, isCapture: true, target: occupant });
				}
				break; // Can't move through pieces, stop in this direction
			} else {
				// Empty cell, we can move here
				validMoves.push({ x: newX, y: newY, isCapture: false });
			}
		}
	}
	
	return validMoves;
}

/**
 * Place a tetromino piece on the board
 * @param {string} shape - Shape of the tetromino (I, J, L, O, S, T, Z)
 * @param {number} rotation - Rotation of the tetromino (0-3)
 * @param {number} x - X position
 * @param {number} y - Y position
 * @returns {Promise<boolean>} - Whether the placement was successful
 */
async function placeTetrominoPiece(shape, rotation, x, y) {
	try {
		if (!gameId) {
			console.log('No game ID available for tetromino placement');
			return false;
		}
		
		console.log(`Placing tetromino ${shape} with rotation ${rotation} at position (${x}, ${y})`);
		
		const moveData = {
			pieceType: shape,
			shape: shape,
			rotation: rotation,
			position: {
				x: x,
				y: y
			}
		};
		
		const response = await fetch(`${API_URL}/games/${gameId}/computer-move`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				gameId,
				playerId,
				apiToken,
				moveType: 'tetromino',
				moveData
			})
		});
		
		if (response.ok) {
			const result = await response.json();
			console.log('✅ Tetromino placement successful!');
			console.log(`Next turn: ${result.nextTurn === playerId ? 'Your turn' : 'Opponent\'s turn'}`);
			console.log(`Next move type: ${result.nextMoveType}`);
			console.log(`Game status: ${result.status}`);
			lastMoveTime = Date.now();
			moveCount++;
			return true;
		} else {
			const errorText = await response.text();
			console.log(`❌ Error placing tetromino: ${errorText}`);
			return false;
		}
	} catch (error) {
		console.error('Error placing tetromino:', error);
		return false;
	}
}