/**
 * MyComputerPlayer - Shaktris Computer Player
 * Created on 2025-03-15T18:10:28.922Z
 */

const axios = require('axios');
const config = require('./computer-player-config');

// Configuration
const API_URL = config.apiUrl;
const PLAYER_NAME = 'MyComputerPlayer';
const API_ENDPOINT = `http://localhost:${config.port}/callback`;

// Player state
let playerId = null;
let apiToken = null;
let currentGameId = null;
let gameState = null;

/**
 * Register the computer player with the game server
 */
async function registerPlayer() {
	try {
		console.log(`Registering player ${PLAYER_NAME}...`);
		
		const response = await axios.post(`${API_URL}/computer-players/register`, {
			name: PLAYER_NAME,
			apiEndpoint: API_ENDPOINT,
			description: 'Custom computer player for Shaktris'
		});
		
		if (response.data.success) {
			playerId = response.data.playerId;
			apiToken = response.data.apiToken;
			console.log(`Successfully registered as ${playerId}`);
			return true;
		} else {
			console.error('Registration failed:', response.data.message);
			return false;
		}
	} catch (error) {
		console.error('Error registering player:', error.message);
		return false;
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
		
		// Try to join each available game
		for (const game of data.games) {
			console.log(`Attempting to join game ${game.id}...`);
			
			try {
				const joinResponse = await axios.post(`${API_URL}/games/${game.id}/add-computer-player`, {
					computerId: playerId,
					apiToken
				});
				
				const joinData = joinResponse.data;
				
				if (joinData.success) {
					console.log(`Successfully joined game ${game.id}`);
					return joinData.gameState;
				} else {
					console.log(`Failed to join game ${game.id}: ${joinData.message}`);
					// Continue to try the next game
				}
			} catch (error) {
				console.error(`Error joining game ${game.id}:`, error);
				// Continue to try the next game
			}
		}
		
		// If we couldn't join any existing games, create a new one
		console.log('Creating a new game...');
		return createAndJoinGame();
	} catch (error) {
		console.error('Error joining game:', error);
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
			options: {
				maxPlayers: 2048 // Set to 2048 players
			}
		}, {
			headers: {
				'X-Player-Id': playerId,
				'X-API-Token': apiToken
			}
		});
		
		const data = response.data;
		
		if (!data.success) {
			throw new Error(data.error || 'Failed to create game');
		}
		
		console.log(`Created and joined game ${data.gameId}`);
		return data.gameState;
	} catch (error) {
		console.error('Error creating game:', error);
		throw error;
	}
}

/**
 * Update the current game state
 */
async function updateGameState() {
	try {
		if (!currentGameId) return false;
		
		const response = await axios.get(`${API_URL}/games/${currentGameId}`);
		
		if (response.data.success) {
			gameState = response.data.game;
			return true;
		} else {
			console.error('Failed to update game state:', response.data.message);
			return false;
		}
	} catch (error) {
		console.error('Error updating game state:', error.message);
		return false;
	}
}

/**
 * Get available tetromino shapes
 */
async function getAvailableTetrominos() {
	try {
		if (!currentGameId) return [];
		
		const response = await axios.get(`${API_URL}/games/${currentGameId}/available-tetrominos`, {
			headers: {
				'X-Player-Id': playerId,
				'X-API-Token': apiToken
			}
		});
		
		if (response.data.success) {
			return response.data.tetrominos;
		} else {
			console.error('Failed to get tetrominos:', response.data.message);
			return [];
		}
	} catch (error) {
		console.error('Error getting tetrominos:', error.message);
		return [];
	}
}

/**
 * Get chess pieces
 */
async function getChessPieces() {
	try {
		if (!currentGameId) return [];
		
		const response = await axios.get(`${API_URL}/games/${currentGameId}/chess-pieces`, {
			headers: {
				'X-Player-Id': playerId,
				'X-API-Token': apiToken
			}
		});
		
		if (response.data.success) {
			return response.data.pieces;
		} else {
			console.error('Failed to get chess pieces:', response.data.message);
			return [];
		}
	} catch (error) {
		console.error('Error getting chess pieces:', error.message);
		return [];
	}
}

/**
 * Visualize the board as ASCII art
 * @param {Array} board - The game board
 * @param {number} centerX - X coordinate to center the view on
 * @param {number} centerY - Y coordinate to center the view on
 * @param {number} highlightX - X coordinate to highlight (for the move)
 * @param {number} highlightY - Y coordinate to highlight (for the move)
 * @param {string} moveType - 'T' for tetromino, 'C' for chess
 */
function visualizeBoard(board, centerX, centerY, highlightX, highlightY, moveType) {
	// Define the size of the view window
	const viewSize = 10;
	const startX = Math.max(0, centerX - Math.floor(viewSize / 2));
	const startY = Math.max(0, centerY - Math.floor(viewSize / 2));
	const endX = Math.min(board.length, startX + viewSize);
	const endY = Math.min(board[0]?.length || 0, startY + viewSize);
	
	console.log("\n=== ASCII Board Visualization ===");
	console.log(`Centered at (${centerX}, ${centerY}) - ${moveType === 'T' ? 'Tetromino' : 'Chess'} move to (${highlightX}, ${highlightY})`);
	
	// Print column headers
	let header = '   ';
	for (let x = startX; x < endX; x++) {
		header += (x % 10) + ' ';
	}
	console.log(header);
	
	// Print top border
	let border = '  +';
	for (let x = startX; x < endX; x++) {
		border += '--';
	}
	console.log(border + '+');
	
	// Print board rows
	for (let y = startY; y < endY; y++) {
		let row = y % 10 + ' |';
		
		for (let x = startX; x < endX; x++) {
			// Check if this is the highlighted position
			if (x === highlightX && y === highlightY) {
				row += moveType === 'T' ? 'T ' : 'C ';
			} 
			// Check if this is the center position
			else if (x === centerX && y === centerY) {
				row += 'K '; // King or current position
			}
			// Otherwise, show the cell content
			else {
				const cell = board[y]?.[x];
				if (!cell) {
					row += '. '; // Empty space
				} else if (cell.chessPiece) {
					// Show chess piece
					const pieceType = cell.chessPiece.type.charAt(0).toUpperCase();
					row += pieceType + ' ';
				} else {
					row += '# '; // Occupied cell (tetromino)
				}
			}
		}
		
		console.log(row + '|');
	}
	
	// Print bottom border
	console.log(border + '+');
	console.log("Legend: K=King, T=Tetromino placement, C=Chess move, #=Occupied, .=Empty");
	console.log("================================\n");
}

/**
 * Make a random tetromino placement
 */
async function placeRandomTetromino() {
	try {
		const tetrominos = await getAvailableTetrominos();
		
		if (tetrominos.length === 0) {
			console.log('No tetrominos available');
			return false;
		}
		
		// Get our chess pieces to find the king
		const pieces = await getChessPieces();
		if (pieces.length === 0) {
			console.log('No chess pieces available');
			return false;
		}
		
		// Find our king
		const king = pieces.find(piece => piece.type === 'king');
		if (!king) {
			console.log('King not found');
			return false;
		}
		
		// Occasionally make a "stupid" move (drop piece in the sky)
		// 15% chance of making a stupid move
		let x, y;
		if (Math.random() < 0.15) {
			console.log("🤪 Making a deliberately poor tetromino placement (dropping in sky)");
			
			// Random position far from the king
			x = king.position.x + (Math.random() > 0.5 ? 1 : -1) * (5 + Math.floor(Math.random() * 5));
			y = king.position.y + (Math.random() > 0.5 ? 1 : -1) * (5 + Math.floor(Math.random() * 5));
		} else {
			// Place near the king
			const centerX = 10;
			const centerY = 10;
			
			// Calculate direction to build (towards center)
			const buildDirectionX = king.position.x < centerX ? 1 : -1;
			const buildDirectionY = king.position.y < centerY ? 1 : -1;
			
			// Simple placement - adjacent to king
			x = king.position.x + buildDirectionX;
			y = king.position.y + buildDirectionY;
		}
		
		// Select a random tetromino
		const tetromino = tetrominos[Math.floor(Math.random() * tetrominos.length)];
		
		// Generate random position and rotation
		const rotation = Math.floor(Math.random() * 4);
		
		console.log(`Placing tetromino ${tetromino.type} at (${x}, ${y}) with rotation ${rotation}`);
		
		// Visualize the board
		if (gameState && gameState.board) {
			visualizeBoard(gameState.board, king.position.x, king.position.y, x, y, 'T');
		}
		
		const response = await axios.post(`${API_URL}/games/${currentGameId}/computer-move`, {
			moveType: 'tetromino',
			tetrominoType: tetromino.type,
			position: { x, y },
			rotation
		}, {
			headers: {
				'X-Player-Id': playerId,
				'X-API-Token': apiToken
			}
		});
		
		if (response.data.success) {
			console.log('Tetromino placed successfully');
			return true;
		} else {
			console.error('Failed to place tetromino:', response.data.message);
			return false;
		}
	} catch (error) {
		console.error('Error placing tetromino:', error.message);
		return false;
	}
}

/**
 * Make a random chess move
 */
async function makeRandomChessMove() {
	try {
		const pieces = await getChessPieces();
		
		if (pieces.length === 0) {
			console.log('No chess pieces available');
			return false;
		}
		
		// Occasionally make a "stupid" move (random chess move)
		// 20% chance of making a stupid move
		if (Math.random() < 0.2) {
			console.log("🤪 Making a deliberately poor chess move (random direction)");
			
			// Pick a random piece
			const piece = pieces[Math.floor(Math.random() * pieces.length)];
			
			// Random direction
			const directions = [
				{ x: 1, y: 0 },
				{ x: -1, y: 0 },
				{ x: 0, y: 1 },
				{ x: 0, y: -1 },
				{ x: 1, y: 1 },
				{ x: 1, y: -1 },
				{ x: -1, y: 1 },
				{ x: -1, y: -1 }
			];
			
			const direction = directions[Math.floor(Math.random() * directions.length)];
			const destX = piece.position.x + direction.x;
			const destY = piece.position.y + direction.y;
			
			// Visualize the board
			if (gameState && gameState.board) {
				visualizeBoard(gameState.board, piece.position.x, piece.position.y, destX, destY, 'C');
			}
			
			console.log(`Moving ${piece.type} from (${piece.position.x}, ${piece.position.y}) to (${destX}, ${destY})`);
			
			const response = await axios.post(`${API_URL}/games/${currentGameId}/computer-move`, {
				moveType: 'chess',
				pieceId: piece.id,
				from: { x: piece.position.x, y: piece.position.y },
				to: { x: destX, y: destY }
			}, {
				headers: {
					'X-Player-Id': playerId,
					'X-API-Token': apiToken
				}
			});
			
			if (response.data.success) {
				console.log('Chess piece moved successfully');
				return true;
			} else {
				console.error('Failed to move chess piece:', response.data.message);
				return false;
			}
		}
		
		// Select a random piece
		const piece = pieces[Math.floor(Math.random() * pieces.length)];
		
		// Generate random destination
		const destX = Math.floor(Math.random() * 10);
		const destY = Math.floor(Math.random() * 10);
		
		// Visualize the board
		if (gameState && gameState.board) {
			visualizeBoard(gameState.board, piece.position.x, piece.position.y, destX, destY, 'C');
		}
		
		console.log(`Moving ${piece.type} from (${piece.position.x}, ${piece.position.y}) to (${destX}, ${destY})`);
		
		const response = await axios.post(`${API_URL}/games/${currentGameId}/computer-move`, {
			moveType: 'chess',
			pieceId: piece.id,
			from: { x: piece.position.x, y: piece.position.y },
			to: { x: destX, y: destY }
		}, {
			headers: {
				'X-Player-Id': playerId,
				'X-API-Token': apiToken
			}
		});
		
		if (response.data.success) {
			console.log('Chess piece moved successfully');
			return true;
		} else {
			console.error('Failed to move chess piece:', response.data.message);
			
			// If no valid chess moves are available, try to place a tetromino instead
			if (response.data.message.includes('Invalid move') || 
				response.data.message.includes('No chess piece found')) {
				console.log('No valid chess moves available. Trying to place a tetromino instead...');
				return await placeRandomTetromino();
			}
			
			return false;
		}
	} catch (error) {
		console.error('Error moving chess piece:', error.message);
		return false;
	}
}

/**
 * Main game loop
 */
async function gameLoop() {
	try {
		// Get the current game state
		const gameState = await getGameState();
		
		if (!gameState) {
			console.log('Failed to get game state. Retrying in 2 seconds...');
			setTimeout(gameLoop, 2000);
			return;
		}
		
		// Check if it's our turn and what move type is expected
		const player = gameState.players[playerId];
		if (!player) {
			console.log('Player not found in game state. Retrying in 2 seconds...');
			setTimeout(gameLoop, 2000);
			return;
		}
		
		const moveType = player.currentMoveType;
		console.log(`Current move type: ${moveType}`);
		
		// Make the appropriate move based on the move type
		if (moveType === 'tetromino') {
			console.log('Making a tetromino move...');
			await placeRandomTetromino(gameState);
		} else if (moveType === 'chess') {
			console.log('Making a chess move...');
			const result = await makeRandomChessMove(gameState);
			
			if (result && result.skipToTetromino) {
				console.log('No valid chess moves available. Skipping to tetromino move...');
				// Continue to the next iteration of the game loop
			} else if (!result || !result.success) {
				console.log('Chess move failed or no valid moves. Trying to skip to tetromino move...');
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
		setTimeout(gameLoop, 500);
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
		const response = await axios.post(`${API_URL}/move/chess`, {
			gameId,
			playerId,
			moveData: {
				skipMove: true
			}
		}, {
			headers: {
				'X-Player-Id': playerId,
				'X-API-Token': apiToken
			}
		});
		
		return response.data;
	} catch (error) {
		console.error('Error skipping chess move:', error);
		return { success: false, error: error.message };
	}
}

/**
 * Main function
 */
async function main() {
	console.log(`Starting ${PLAYER_NAME}...`);
	
	// Register player
	if (!await registerPlayer()) {
		console.error('Failed to register player. Exiting...');
		process.exit(1);
	}
	
	// Join a game
	if (!await joinGame()) {
		console.error('Failed to join a game. Exiting...');
		process.exit(1);
	}
	
	// Update game state
	await updateGameState();
	
	// Game loop
	console.log('Starting game loop...');
	
	// Example of a simple game loop
	// In a real implementation, you would listen for turn notifications
	// and make moves accordingly
	setInterval(async () => {
		await updateGameState();
		
		if (gameState) {
			// In asynchronous turns, we don't check currentTurn, only currentMoveType
			const moveType = gameState.currentMoveType;
			console.log(`Current move type: ${moveType}`);
			
			if (moveType === 'tetromino') {
				await placeRandomTetromino();
			} else if (moveType === 'chess') {
				await makeRandomChessMove();
			}
		}
	}, 5000);
}

// Start the player
main().catch(console.error);
