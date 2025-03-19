/**
 * Improved Computer Player Example for Shaktris
 * 
 * This is an enhanced implementation of an external computer player that connects
 * to the Shaktris API and follows the correct turn sequence.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

// Configuration - replace with your own values
const API_URL = process.env.API_URL || 'http://localhost:3020/api';
const PLAYER_NAME = process.env.PLAYER_NAME || `ImprovedBot-${uuidv4().substring(0, 6)}`;
const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:8080/callback';

// Game state tracking
let playerId = null;
let apiToken = null;
let gameId = null;
let lastMoveTime = 0;

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
		console.log(`Connecting to API at: ${API_URL}/computer-players/register`);
		
		const response = await axios.post(`${API_URL}/computer-players/register`, {
			name: PLAYER_NAME,
			apiEndpoint: API_ENDPOINT,
			description: 'An improved example computer player for Shaktris'
		}, {
			timeout: 5000 // Add a timeout to prevent hanging
		});
		
		if (response.data.success) {
			playerId = response.data.playerId;
			apiToken = response.data.apiToken;
			
			console.log(`Successfully registered as ${playerId}`);
			console.log(`API Token: ${apiToken.substring(0, 10)}...`);
			
			return true;
		} else {
			console.error('Registration failed:', response.data.message);
			return false;
		}
	} catch (error) {
		console.error('Error registering player:');
		if (error.response) {
			// The request was made and the server responded with a status code
			// that falls out of the range of 2xx
			console.error(`Status: ${error.response.status}`);
			console.error('Data:', error.response.data);
			console.error('Headers:', error.response.headers);
		} else if (error.request) {
			// The request was made but no response was received
			console.error('No response received from server. Server might be down or unreachable.');
			console.error('Request:', error.request);
		} else {
			// Something happened in setting up the request that triggered an Error
			console.error('Error message:', error.message);
		}
		console.error('Error config:', error.config);
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
		
		if (!response.data.success) {
			throw new Error(response.data.error || 'Failed to get games list');
		}
		
		console.log('Available games:', JSON.stringify(response.data.games, null, 2));
		
		// Check if games is an array or an object
		const gamesList = Array.isArray(response.data.games) ? response.data.games : Object.values(response.data.games || {});
		
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
		console.log(`Creating a new game with player ID: ${playerId}`);
		console.log(`API URL: ${API_URL}/games`);
		
		const requestData = {
			playerId: playerId,
			username: PLAYER_NAME,
			options: {
				maxPlayers: 2048,
				gameMode: 'standard',
				difficulty: 'normal'
			}
		};
		
		console.log('Request data:', JSON.stringify(requestData, null, 2));
		
		const response = await axios.post(`${API_URL}/games`, requestData, {
			timeout: 5000 // Add a timeout to prevent hanging
		});
		
		const data = response.data;
		
		if (!data.success) {
			console.error('Failed to create game:', data.error || 'Unknown error');
			throw new Error(data.error || 'Failed to create game');
		}
		
		gameId = data.gameId;
		console.log(`Created and joined game ${gameId}`);
		
		// Verify the game state
		if (data.gameState) {
			console.log('Game state received:', Object.keys(data.gameState).join(', '));
			return data.gameState;
		} else {
			console.warn('Game created but no game state returned');
			
			// Try to get the game state separately
			const gameState = await getGameState();
			if (gameState) {
				return gameState;
			} else {
				throw new Error('Failed to get game state after creation');
			}
		}
	} catch (error) {
		console.error('Error creating game:');
		if (error.response) {
			console.error(`Status: ${error.response.status}`);
			console.error('Data:', error.response.data);
		} else if (error.request) {
			console.error('No response received from server');
		} else {
			console.error('Error message:', error.message);
		}
		throw error;
	}
}

/**
 * Get the current game state
 */
async function getGameState() {
	try {
		if (!gameId) return null;
		
		const response = await axios.get(`${API_URL}/games/${gameId}`);
		
		if (response.data.success) {
			return response.data.game;
		} else {
			console.error('Failed to get game state:', response.data.message);
			return null;
		}
	} catch (error) {
		console.error('Error getting game state:', error.response?.data || error.message);
		return null;
	}
}

/**
 * Get available tetromino shapes
 */
async function getAvailableTetrominos() {
	try {
		if (!gameId) return [];
		
		const response = await axios.get(
			`${API_URL}/games/${gameId}/available-tetrominos?playerId=${playerId}&apiToken=${apiToken}`
		);
		
		if (response.data.success) {
			return response.data.tetrominos;
		} else {
			console.error('Failed to get tetrominos:', response.data.message);
			return [];
		}
	} catch (error) {
		console.error('Error getting tetrominos:', error.response?.data || error.message);
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
			// Ensure all chess pieces have the correct position object structure
			const chessPieces = response.data.chessPieces.map(piece => {
				// If the piece already has a position object, return it as is
				if (piece.position && typeof piece.position.x === 'number' && typeof piece.position.y === 'number') {
					return piece;
				}
				
				// If the piece has direct x and y properties, convert them to a position object
				if (typeof piece.x === 'number' && typeof piece.y === 'number') {
					return {
						...piece,
						position: {
							x: piece.x,
							y: piece.y
						}
					};
				}
				
				// If the piece has no position information, return it as is
				return piece;
			});
			
			return chessPieces;
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
	console.log(`\n=== ${moveType.toUpperCase()} MOVE ===`);
	
	if (moveType === 'chess') {
		let pieceId, fromX, fromY, toX, toY;
		
		// Handle both formats of move data
		if (moveData.position) {
			pieceId = moveData.pieceId;
			fromX = moveData.position.fromX;
			fromY = moveData.position.fromY;
			toX = moveData.position.toX;
			toY = moveData.position.toY;
		} else {
			pieceId = moveData.pieceId;
			fromX = moveData.fromX;
			fromY = moveData.fromY;
			toX = moveData.toX;
			toY = moveData.toY;
		}
		
		// Check if pieceId is defined before trying to split it
		const pieceType = pieceId && pieceId.includes('_') ? pieceId.split('_')[1] : 'unknown';
		console.log(`Piece: ${pieceType}`);
		console.log(`From: (${fromX}, ${fromY})`);
		console.log(`To: (${toX}, ${toY})`);
		console.log(`Move distance: ${Math.abs(toX - fromX) + Math.abs(toY - fromY)}`);
		
		// Format the move data correctly for the server
		const formattedMoveData = {
			pieceId,
			position: {
				fromX,
				fromY,
				toX,
				toY
			}
		};
		
		console.log(`Sending move data to server: ${JSON.stringify(formattedMoveData)}`);
		
		try {
			const response = await axios.post(`${API_URL}/games/${gameId}/computer-move`, {
				playerId,
				apiToken,
				moveType,
				moveData: formattedMoveData
			});
			
			if (response.data.success) {
				console.log('✅ CHESS move successful!');
				return true;
			} else {
				console.log(`❌ Error making chess move: ${response.data.message || 'Unknown error'}`);
				console.log('\nChess move failed. Trying to skip to tetromino move...');
				
				// Try to skip the chess move
				const skipResult = await skipChessMove();
				
				if (skipResult.success) {
					console.log('✅ Chess move skipped!');
					return true;
				} else {
					console.log(`❌ Failed to skip chess move: ${skipResult.error}`);
					return false;
				}
			}
		} catch (error) {
			console.log(`❌ Error making chess move: ${error.response?.data?.message || error.message}`);
			console.log('\nChess move failed. Trying to skip to tetromino move...');
			
			// Try to skip the chess move
			const skipResult = await skipChessMove();
			
			if (skipResult.success) {
				console.log('✅ Chess move skipped!');
				return true;
			} else {
				console.log(`❌ Failed to skip chess move: ${skipResult.error}`);
				return false;
			}
		}
	} else if (moveType === 'tetromino') {
		// Extract tetromino move data
		const { pieceType, type, shape, rotation, x, y, position } = moveData;
		
		console.log(`Tetromino: ${pieceType || type || shape}`);
		console.log(`Rotation: ${rotation}`);
		console.log(`Position: (${x || position.x}, ${y || position.y})`);
		
		try {
			const response = await axios.post(`${API_URL}/games/${gameId}/computer-move`, {
				playerId,
				apiToken,
				moveType,
				moveData
			});
			
			if (response.data.success) {
				console.log('✅ Tetromino move successful!');
				console.log(`Next turn: ${response.data.nextTurn === playerId ? 'Your turn' : 'Opponent\'s turn'}`);
				console.log(`Next move type: ${response.data.nextMoveType}`);
				console.log(`Game status: ${response.data.status}`);
				lastMoveTime = Date.now();
				return true;
			} else {
				console.log(`❌ Error placing tetromino: ${response.data.message || 'Unknown error'}`);
				return false;
			}
		} catch (error) {
			console.error('Error placing tetromino:', error.response?.data?.message || error.message);
			return false;
		}
	} else {
		console.log(`Unknown move type: ${moveType}. Retrying in 2 seconds...`);
		setTimeout(gameLoop, 2000);
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
	
	// Check if the board exists
	if (!gameState.board) {
		console.log('Board not found in gameState');
		return null;
	}
	
	const board = gameState.board;
	
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
	const tetrominoTypes = availableTetrominos && availableTetrominos.length > 0 
		? availableTetrominos.map(t => t.shape) 
		: ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
	
	// Occasionally make a "stupid" move (15% chance)
	const makeStupidMove = Math.random() < 0.15;
	
	if (makeStupidMove) {
		console.log("🤪 Making a deliberately poor tetromino placement (far from king)");
		
		// Choose a random tetromino type and rotation from available ones
		const randomIndex = Math.floor(Math.random() * tetrominoTypes.length);
		const randomType = tetrominoTypes[randomIndex];
		
		// Get rotation limit for this shape from available tetrominos if possible
		let maxRotation = 4;
		if (availableTetrominos && availableTetrominos.length > 0) {
			const matchingTetromino = availableTetrominos.find(t => t.shape === randomType);
			if (matchingTetromino && matchingTetromino.rotations) {
				maxRotation = matchingTetromino.rotations;
			}
		}
		
		const randomRotation = Math.floor(Math.random() * maxRotation);
		
		// Place it in a random position far from the king
		const randomX = Math.floor(Math.random() * board.width);
		const randomY = Math.floor(Math.random() * board.height);
		
		console.log(`Using random tetromino: ${randomType} with rotation ${randomRotation} at position (${randomX}, ${randomY})`);
		
		// Visualize the board with this move
		visualizeBoard(gameState, { to: { x: randomX, y: randomY } });
		
		return {
			pieceType: randomType,
			type: randomType,
			rotation: randomRotation,
			x: randomX,
			y: randomY,
			position: { x: randomX, y: randomY },
			isStupidMove: true
		};
	}
	
	// Choose a tetromino from available ones
	let chosenTetromino;
	let currentTetromino;
	
	if (availableTetrominos && availableTetrominos.length > 0) {
		// Choose a random tetromino from available ones
		const randomIndex = Math.floor(Math.random() * availableTetrominos.length);
		chosenTetromino = availableTetrominos[randomIndex];
		
		// Get rotation limit for this shape
		const maxRotation = chosenTetromino.rotations || 4;
		const randomRotation = Math.floor(Math.random() * maxRotation);
		
		console.log(`Using server tetromino: ${chosenTetromino.shape} with rotation ${randomRotation}`);
		
		currentTetromino = {
			type: chosenTetromino.shape,
			rotation: randomRotation
		};
	} else {
		// Fallback to random tetromino if none available from server
		const randomType = tetrominoTypes[Math.floor(Math.random() * tetrominoTypes.length)];
		const randomRotation = Math.floor(Math.random() * 4);
		
		console.log(`Using fallback tetromino: ${randomType} with rotation ${randomRotation}`);
		
		currentTetromino = {
			type: randomType,
			rotation: randomRotation
		};
	}
	
	// Find positions close to the king to protect it
	const possiblePositions = [];
	
	// Consider the movement limit: max 3 horizontal units per vertical unit
	// For the first move, we don't have a previous position, so we can place anywhere
	const lastPlacement = player.lastTetrominoPlacement;
	
	// Search for valid positions
	for (let x = 0; x < board.width; x++) {
		for (let y = 0; y < board.height; y++) {
			// Skip if this position would exceed the movement limit
			if (lastPlacement) {
				const horizontalDistance = Math.abs(x - lastPlacement.position.x);
				const verticalDistance = Math.abs(y - lastPlacement.position.y);
				
				// Skip if horizontal movement exceeds the limit (3 units per vertical unit)
				if (verticalDistance > 0 && horizontalDistance > verticalDistance * 3) {
					continue;
				}
			}
			
			// Check if position is valid for the tetromino
			const isValid = isValidTetrominoPlacement(board, currentTetromino, x, y);
			if (isValid) {
				// Calculate distance to king
				const distance = Math.sqrt(
					Math.pow(x - kingPosition.x, 2) + 
					Math.pow(y - kingPosition.y, 2)
				);
				
				possiblePositions.push({
					type: currentTetromino.type,
					rotation: currentTetromino.rotation,
					position: { x, y },
					distance
				});
			}
		}
	}
	
	// Sort by distance to king (closest first)
	possiblePositions.sort((a, b) => a.distance - b.distance);
	
	// Return the best position or a default position if none found
	if (possiblePositions.length > 0) {
		const bestPosition = possiblePositions[0];
		
		// Visualize the board with this move
		visualizeBoard(gameState, { to: bestPosition.position });
		
		return {
			pieceType: bestPosition.type,
			type: bestPosition.type,
			rotation: bestPosition.rotation,
			x: bestPosition.position.x,
			y: bestPosition.position.y,
			position: bestPosition.position
		};
	} else {
		console.log('No valid tetromino placement found, using default');
		
		// Visualize the board with this move
		visualizeBoard(gameState, { to: kingPosition });
		
		return {
			pieceType: currentTetromino.type,
			type: currentTetromino.type,
			rotation: currentTetromino.rotation,
			x: kingPosition.x,
			y: kingPosition.y,
			position: { x: kingPosition.x, y: kingPosition.y } // Place above the king
		};
	}
}

/**
 * Find the best chess move for the current game state
 * @param {Object} gameState - Current game state
 * @param {string} playerId - Player ID
 * @returns {Object|null} Best chess move or null if no valid moves
 */
async function findBestChessMove(gameState, playerId) {
	if (!gameState || !gameState.chessPieces) {
		console.log("No chess pieces found in game state");
		return null;
	}

	// Log the chess pieces to help debug
	console.log("Chess pieces in game state:", JSON.stringify(gameState.chessPieces, null, 2).substring(0, 500));

	// Filter chess pieces to only include those belonging to the player
	const playerPieces = gameState.chessPieces.filter(piece => piece.player === playerId);
	
	if (playerPieces.length === 0) {
		console.log(`No chess pieces found for player ${playerId}`);
		return null;
	}

	console.log(`Found ${playerPieces.length} chess pieces for player ${playerId}`);
	
	// Log detailed information about each piece
	playerPieces.forEach((piece, index) => {
		console.log(`Piece ${index + 1}:`, JSON.stringify(piece, null, 2));
	});
	
	// Visualize the board to help with debugging
	visualizeBoard(gameState, playerId);
	
	// Get board dimensions
	const boardWidth = gameState.board?.width || 20;
	const boardHeight = gameState.board?.height || 20;
	
	// Try to find a valid move for any piece
	for (const piece of playerPieces) {
		// Get the piece position, handling different position formats
		let pieceX, pieceY;
		
		if (piece.position && typeof piece.position.x === 'number' && typeof piece.position.y === 'number') {
			// Server format with position object
			pieceX = piece.position.x;
			pieceY = piece.position.y;
		} else if (typeof piece.x === 'number' && typeof piece.y === 'number') {
			// Direct x,y properties
			pieceX = piece.x;
			pieceY = piece.y;
			
			// Add position property for server compatibility
			piece.position = {
				x: pieceX,
				y: pieceY
			};
		} else {
			console.log(`Skipping piece ${piece.type} without valid position`);
			continue;
		}
		
		console.log(`Checking moves for ${piece.type} at (${pieceX}, ${pieceY})`);
		
		// Get valid moves for this piece
		const validMoves = getValidMovesForPiece(piece, gameState);
		
		if (validMoves.length > 0) {
			// For simplicity, we'll choose a move that gets us closer to the center of the board
			// This is a very basic strategy
			const centerX = Math.floor(boardWidth / 2);
			const centerY = Math.floor(boardHeight / 2);
			
			// Sort moves by distance to center (closest first)
			validMoves.sort((a, b) => {
				const distA = Math.sqrt(Math.pow(a.x - centerX, 2) + Math.pow(a.y - centerY, 2));
				const distB = Math.sqrt(Math.pow(b.x - centerX, 2) + Math.pow(b.y - centerY, 2));
				return distA - distB;
			});
			
			// Choose the move closest to the center
			const bestMove = validMoves[0];
			
			// Calculate the Manhattan distance between current position and target position
			const moveDistance = Math.abs(pieceX - bestMove.x) + Math.abs(pieceY - bestMove.y);
			
			// For kings, ensure we're only moving one square in any direction
			if (piece.type === 'king' && moveDistance > 1) {
				console.log(`Invalid king move: distance ${moveDistance} is too far. Kings can only move 1 square.`);
				continue;
			}
			
			// Ensure the destination is within the board bounds
			if (bestMove.x < 0 || bestMove.x >= boardWidth || bestMove.y < 0 || bestMove.y >= boardHeight) {
				console.log(`Invalid move: destination (${bestMove.x}, ${bestMove.y}) is outside the board bounds.`);
				continue;
			}
			
			console.log(`Selected move for ${piece.type}: (${pieceX}, ${pieceY}) -> (${bestMove.x}, ${bestMove.y})`);
			console.log(`Move distance: ${moveDistance}`);
			
			// Return move data in the format expected by the server
			return {
				pieceId: piece.id,
				position: {
					fromX: pieceX,
					fromY: pieceY,
					toX: bestMove.x,
					toY: bestMove.y
				}
			};
		}
	}
	
	console.log("No valid chess moves found for any piece");
	return null;
}

/**
 * Visualize the board as ASCII art with improved clarity
 * @param {Object} gameState - Current game state
 * @param {Object} move - The move to highlight (optional)
 */
function visualizeBoard(gameState, move) {
	if (!gameState || !gameState.board) {
		console.log("No board data available for visualization");
		return;
	}

	const board = gameState.board;
	const width = board.width;
	const height = board.height;
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
		// Handle different position formats
		let pieceX, pieceY;
		
		if (piece.position && typeof piece.position.x === 'number' && typeof piece.position.y === 'number') {
			// Server format with position object
			pieceX = piece.position.x;
			pieceY = piece.position.y;
		} else if (typeof piece.x === 'number' && typeof piece.y === 'number') {
			// Direct x,y properties
			pieceX = piece.x;
			pieceY = piece.y;
		} else {
			return; // Skip this piece
		}
		
		if (piece && piece.type && pieceX >= 0 && pieceX < width && pieceY >= 0 && pieceY < height) {
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
			boardArray[pieceY][pieceX] = piece.player === playerId ? symbol : symbol.toLowerCase();
		}
	});
	
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
				if (gameState && gameState.id) {
					gameId = gameState.id;
					console.log(`Successfully joined game ${gameId}`);
					
					// Display the initial game state visualization
					await displayServerVisualization();
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
				// Display visualization with the planned move highlighted
				await displayServerVisualization({
					highlightX: chessMove.position.toX,
					highlightY: chessMove.position.toY
				});
				
				const success = await makeMove('chess', chessMove);
				
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
		const response = await axios.post(`${API_URL}/games/${gameId}/computer-move`, {
			playerId: playerId,
			apiToken: apiToken,
			moveType: 'chess',
			moveData: {
				skipMove: true
			}
		});
		
		if (response.data.success) {
			console.log('✅ Chess move skipped!');
			return response.data;
		} else {
			console.error('❌ Error skipping chess move:', response.data.message || 'Unknown error');
			return { success: false, error: response.data.message || 'Unknown error' };
		}
	} catch (error) {
		console.error('Error skipping chess move:', error.response?.data?.message || error.message);
		return { success: false, error: error.response?.data?.message || error.message };
	}
}

/**
 * Start the computer player
 */
async function start() {
	console.log('Starting Improved Shaktris Computer Player...');
	console.log(`Player name: ${PLAYER_NAME}`);
	console.log(`API URL: ${API_URL}`);
	console.log(`API Endpoint: ${API_ENDPOINT}`);
	
	try {
		// Register the player
		const registered = await registerPlayer();
		if (!registered) {
			console.error('Failed to register player. Exiting...');
			return;
		}
		
		console.log('Successfully registered. Attempting to join a game...');
		
		// Join a game
		const gameState = await joinGame();
		if (!gameState) {
			console.error('Failed to join a game. Exiting...');
			return;
		}
		
		console.log(`Successfully joined game: ${gameId}`);
		console.log('Starting game loop...');
		
		// Start the game loop
		gameLoop().catch(error => {
			console.error('Error in game loop:', error);
		});
	} catch (error) {
		console.error('Error starting computer player:', error);
	}
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
	getGameState
}; 

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
	
	// Try to find the king in different ways
	if (player.pieces && Array.isArray(player.pieces)) {
		const king = player.pieces.find(piece => piece.type === 'king');
		if (king && king.position) {
			return king.position;
		}
	}
	
	// If we can't find the king in the player's pieces, try to find it in the game's chess pieces
	if (gameState.chessPieces && Array.isArray(gameState.chessPieces)) {
		const king = gameState.chessPieces.find(piece => piece.player === playerId && piece.type === 'king');
		if (king && king.position) {
			return king.position;
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
	console.log(`Status: ${gameState.status}`);
	console.log(`Current Turn: ${gameState.currentTurn === playerId ? 'Our Turn' : 'Opponent Turn'}`);
	console.log(`Current Move Type: ${gameState.currentMoveType}`);
	
	// Print players
	console.log("\nPlayers:");
	gameState.players.forEach(player => {
		console.log(`- ${player.name} (${player.id})${player.id === playerId ? ' (us)' : ''}`);
	});
	
	// Print chess pieces for all players
	console.log("\nChess Pieces:");
	
	// Group chess pieces by player
	const piecesByPlayer = {};
	gameState.chessPieces?.forEach(piece => {
		if (!piecesByPlayer[piece.player]) {
			piecesByPlayer[piece.player] = [];
		}
		piecesByPlayer[piece.player].push(piece);
	});
	
	// Find player names
	const playerNames = {};
	gameState.players.forEach(player => {
		playerNames[player.id] = player.name;
	});
	
	// Print pieces for each player
	Object.keys(piecesByPlayer).forEach(playerId => {
		const playerName = playerNames[playerId] || 'Unknown';
		console.log(`  Player ${playerName} (${playerId}):`);
		
		piecesByPlayer[playerId].forEach(piece => {
			// Handle different position formats
			let pieceX, pieceY;
			
			if (piece.position && typeof piece.position.x === 'number' && typeof piece.position.y === 'number') {
				// Server format with position object
				pieceX = piece.position.x;
				pieceY = piece.position.y;
			} else if (typeof piece.x === 'number' && typeof piece.y === 'number') {
				// Direct x,y properties
				pieceX = piece.x;
				pieceY = piece.y;
			} else {
				pieceX = null;
				pieceY = null;
			}
			
			if (pieceX !== null && pieceY !== null) {
				console.log(`    - ${piece.type} at (${pieceX}, ${pieceY})`);
			} else {
				console.log(`    - ${piece.type} (position unknown)`);
			}
		});
	});
	
	// Print our available tetrominos
	console.log("\nAvailable Tetrominos:");
	const tetrominos = gameState.availableTetrominos?.[playerId] || [];
	tetrominos.forEach(tetromino => {
		console.log(`- ${tetromino.shape} (${tetromino.rotations} rotations)`);
	});
	
	console.log("\nLast Tetromino Placement:");
	const player = gameState.players.find(p => p.id === playerId);
	if (player && player.lastTetrominoPlacement) {
		const placement = player.lastTetrominoPlacement;
		console.log(`- Shape: ${placement.shape}`);
		console.log(`- Rotation: ${placement.rotation}`);
		console.log(`- Position: (${placement.position.x}, ${placement.position.y})`);
	} else {
		console.log("- No previous placement");
	}
	
	console.log("================================\n");
}

/**
 * Get valid moves for a chess piece
 * @param {Object} piece - The chess piece
 * @param {Object} gameState - The current game state
 * @returns {Array} - Array of valid move positions
 */
function getValidMovesForPiece(piece, gameState) {
	// Handle different position formats
	let pieceX, pieceY;
	
	if (piece.position && typeof piece.position.x === 'number' && typeof piece.position.y === 'number') {
		// Server format with position object
		pieceX = piece.position.x;
		pieceY = piece.position.y;
	} else if (typeof piece.x === 'number' && typeof piece.y === 'number') {
		// Direct x,y properties
		pieceX = piece.x;
		pieceY = piece.y;
	} else {
		console.log(`Piece ${piece.type} has no valid position`);
		return [];
	}
	
	if (!piece) {
		return [];
	}

	const board = gameState.board;
	const width = board.width || 20;
	const height = board.height || 20;
	const cells = board.cells || [];
	const chessPieces = gameState.chessPieces || [];
	
	// Create a 2D array to represent the board occupancy
	const occupiedCells = {};
	
	// Mark cells occupied by chess pieces
	chessPieces.forEach(p => {
		// Handle different position formats for other pieces too
		let px, py;
		
		if (p.position && typeof p.position.x === 'number' && typeof p.position.y === 'number') {
			// Server format with position object
			px = p.position.x;
			py = p.position.y;
		} else if (typeof p.x === 'number' && typeof p.y === 'number') {
			// Direct x,y properties
			px = p.x;
			py = p.y;
		} else {
			return; // Skip this piece
		}
		
		const key = `${px},${py}`;
		occupiedCells[key] = p;
	});
	
	// Mark cells occupied by tetrominos
	cells.forEach(cell => {
		if (cell && cell.hasTetromino && typeof cell.x === 'number' && typeof cell.y === 'number') {
			const key = `${cell.x},${cell.y}`;
			occupiedCells[key] = { type: 'tetromino' };
		}
	});
	
	// Function to check if a position is valid and not occupied by our own piece
	function isValidPosition(x, y) {
		// Check if position is within board boundaries
		if (x < 0 || x >= width || y < 0 || y >= height) {
			return false;
		}
		
		// Check if position is occupied by our own piece
		const key = `${x},${y}`;
		const occupant = occupiedCells[key];
		if (occupant && occupant.player === piece.player) {
			return false;
		}
		
		return true;
	}
	
	const validMoves = [];
	const x = pieceX;
	const y = pieceY;
	
	switch (piece.type) {
		case 'king':
			// King can move one square in any direction
			for (let dx = -1; dx <= 1; dx++) {
				for (let dy = -1; dy <= 1; dy++) {
					if (dx === 0 && dy === 0) continue; // Skip current position
					if (isValidPosition(x + dx, y + dy)) {
						validMoves.push({ x: x + dx, y: y + dy });
					}
				}
			}
			break;
			
		case 'queen':
			// Queen can move any number of squares horizontally, vertically, or diagonally
			// Horizontal moves (right)
			for (let dx = 1; x + dx < width; dx++) {
				if (isValidPosition(x + dx, y)) {
					validMoves.push({ x: x + dx, y });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x + dx},${y}`]) break;
				} else {
					break;
				}
			}
			// Horizontal moves (left)
			for (let dx = -1; x + dx >= 0; dx--) {
				if (isValidPosition(x + dx, y)) {
					validMoves.push({ x: x + dx, y });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x + dx},${y}`]) break;
				} else {
					break;
				}
			}
			// Vertical moves (down)
			for (let dy = 1; y + dy < height; dy++) {
				if (isValidPosition(x, y + dy)) {
					validMoves.push({ x, y: y + dy });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x},${y + dy}`]) break;
				} else {
					break;
				}
			}
			// Vertical moves (up)
			for (let dy = -1; y + dy >= 0; dy--) {
				if (isValidPosition(x, y + dy)) {
					validMoves.push({ x, y: y + dy });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x},${y + dy}`]) break;
				} else {
					break;
				}
			}
			// Diagonal moves (down-right)
			for (let d = 1; x + d < width && y + d < height; d++) {
				if (isValidPosition(x + d, y + d)) {
					validMoves.push({ x: x + d, y: y + d });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x + d},${y + d}`]) break;
				} else {
					break;
				}
			}
			// Diagonal moves (down-left)
			for (let d = 1; x - d >= 0 && y + d < height; d++) {
				if (isValidPosition(x - d, y + d)) {
					validMoves.push({ x: x - d, y: y + d });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x - d},${y + d}`]) break;
				} else {
					break;
				}
			}
			// Diagonal moves (up-right)
			for (let d = 1; x + d < width && y - d >= 0; d++) {
				if (isValidPosition(x + d, y - d)) {
					validMoves.push({ x: x + d, y: y - d });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x + d},${y - d}`]) break;
				} else {
					break;
				}
			}
			// Diagonal moves (up-left)
			for (let d = 1; x - d >= 0 && y - d >= 0; d++) {
				if (isValidPosition(x - d, y - d)) {
					validMoves.push({ x: x - d, y: y - d });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x - d},${y - d}`]) break;
				} else {
					break;
				}
			}
			break;
			
		case 'rook':
			// Rook can move any number of squares horizontally or vertically
			// Horizontal moves (right)
			for (let dx = 1; x + dx < width; dx++) {
				if (isValidPosition(x + dx, y)) {
					validMoves.push({ x: x + dx, y });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x + dx},${y}`]) break;
				} else {
					break;
				}
			}
			// Horizontal moves (left)
			for (let dx = -1; x + dx >= 0; dx--) {
				if (isValidPosition(x + dx, y)) {
					validMoves.push({ x: x + dx, y });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x + dx},${y}`]) break;
				} else {
					break;
				}
			}
			// Vertical moves (down)
			for (let dy = 1; y + dy < height; dy++) {
				if (isValidPosition(x, y + dy)) {
					validMoves.push({ x, y: y + dy });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x},${y + dy}`]) break;
				} else {
					break;
				}
			}
			// Vertical moves (up)
			for (let dy = -1; y + dy >= 0; dy--) {
				if (isValidPosition(x, y + dy)) {
					validMoves.push({ x, y: y + dy });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x},${y + dy}`]) break;
				} else {
					break;
				}
			}
			break;
			
		case 'bishop':
			// Bishop can move any number of squares diagonally
			// Diagonal moves (down-right)
			for (let d = 1; x + d < width && y + d < height; d++) {
				if (isValidPosition(x + d, y + d)) {
					validMoves.push({ x: x + d, y: y + d });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x + d},${y + d}`]) break;
				} else {
					break;
				}
			}
			// Diagonal moves (down-left)
			for (let d = 1; x - d >= 0 && y + d < height; d++) {
				if (isValidPosition(x - d, y + d)) {
					validMoves.push({ x: x - d, y: y + d });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x - d},${y + d}`]) break;
				} else {
					break;
				}
			}
			// Diagonal moves (up-right)
			for (let d = 1; x + d < width && y - d >= 0; d++) {
				if (isValidPosition(x + d, y - d)) {
					validMoves.push({ x: x + d, y: y - d });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x + d},${y - d}`]) break;
				} else {
					break;
				}
			}
			// Diagonal moves (up-left)
			for (let d = 1; x - d >= 0 && y - d >= 0; d++) {
				if (isValidPosition(x - d, y - d)) {
					validMoves.push({ x: x - d, y: y - d });
					// Stop if we hit an occupied cell
					if (occupiedCells[`${x - d},${y - d}`]) break;
				} else {
					break;
				}
			}
			break;
			
		case 'knight':
			// Knight moves in an L-shape: 2 squares in one direction and then 1 square perpendicular
			const knightMoves = [
				{ dx: 2, dy: 1 }, { dx: 2, dy: -1 },
				{ dx: -2, dy: 1 }, { dx: -2, dy: -1 },
				{ dx: 1, dy: 2 }, { dx: 1, dy: -2 },
				{ dx: -1, dy: 2 }, { dx: -1, dy: -2 }
			];
			
			for (const move of knightMoves) {
				const newX = x + move.dx;
				const newY = y + move.dy;
				if (isValidPosition(newX, newY)) {
					validMoves.push({ x: newX, y: newY });
				}
			}
			break;
			
		case 'pawn':
			// Pawns move forward one square, or two squares from their starting position
			// They capture diagonally forward
			// For simplicity, we'll assume pawns always move "up" (decreasing y)
			// In a real game, this would depend on the player's side
			
			// Forward move (one square)
			if (isValidPosition(x, y - 1) && !occupiedCells[`${x},${y - 1}`]) {
				validMoves.push({ x, y: y - 1 });
				
				// Forward move (two squares from starting position)
				// Assuming starting position is at y = height - 2 (second row from bottom)
				if (y === height - 2 && isValidPosition(x, y - 2) && !occupiedCells[`${x},${y - 2}`]) {
					validMoves.push({ x, y: y - 2 });
				}
			}
			
			// Diagonal captures
			if (isValidPosition(x + 1, y - 1) && occupiedCells[`${x + 1},${y - 1}`] && occupiedCells[`${x + 1},${y - 1}`].player !== piece.player) {
				validMoves.push({ x: x + 1, y: y - 1 });
			}
			if (isValidPosition(x - 1, y - 1) && occupiedCells[`${x - 1},${y - 1}`] && occupiedCells[`${x - 1},${y - 1}`].player !== piece.player) {
				validMoves.push({ x: x - 1, y: y - 1 });
			}
			break;
	}
	
	return validMoves;
} 