/**
 * Game State Module
 * 
 * Manages the client-side game state, including the board, players, and game settings.
 */

import Network from '../utils/network-patch.js';

// Default game state
const DEFAULT_GAME_STATE = {
	gameId: null,
	playerId: null,
	players: {},
	board: [],
	boardWidth: 20,
	boardHeight: 20,
	cellSize: 30,
	fallingPiece: null,
	ghostPiece: null,
	homeZones: {},
	isPaused: false,
	isGameOver: false,
	winner: null,
	score: 0,
	level: 1,
	linesCleared: 0,
	nextPiece: null,
	heldPiece: null,
	canHold: true,
	offline: false,
	linesPerLevel: 10
};

// Current game state
let gameState = { ...DEFAULT_GAME_STATE };

// Player ID
let playerId = null;

/**
 * Initialize the game state
 * @param {Object} config - Configuration options
 * @returns {Object} The initialized game state
 */
export function initGameState(config = {}) {
	// Reset game state
	gameState = { ...DEFAULT_GAME_STATE, ...config };
	
	// Initialize the board as a 2D array
	initializeBoard();
	
	// Initialize score-related properties
	gameState.score = 0;
	gameState.level = 1;
	gameState.linesCleared = 0;
	gameState.linesPerLevel = 10; // Lines needed to advance to the next level
	
	return gameState;
}

/**
 * Initialize the board as a 2D array
 */
function initializeBoard() {
	const { boardWidth, boardHeight } = gameState;
	
	// Create empty board
	gameState.board = [];
	
	// Initialize board with empty cells
	for (let y = 0; y < boardHeight; y++) {
		gameState.board[y] = [];
		for (let x = 0; x < boardWidth; x++) {
			gameState.board[y][x] = {
				x,
				y,
				type: null,
				playerId: null,
				inHomeZone: false
			};
		}
	}
}

/**
 * Get the current game state
 * @returns {Object} The current game state
 */
export function getGameState() {
	return gameState;
}

/**
 * Update the game state
 * @param {Object} newState - The new game state
 * @returns {Object} The updated game state
 */
export function updateGameState(newState) {
	// Merge the new state with the current state
	gameState = { ...gameState, ...newState };
	
	// Ensure the board is properly structured
	ensureBoardStructure();
	
	// Dispatch a game state update event
	dispatchGameStateUpdateEvent();
	
	return gameState;
}

/**
 * Ensure the board is properly structured as a 2D array
 */
function ensureBoardStructure() {
	const { boardWidth, boardHeight } = gameState;
	
	// If board is not an array or is empty, initialize it
	if (!Array.isArray(gameState.board) || gameState.board.length === 0) {
		initializeBoard();
		return;
	}
	
	// Ensure each row exists and has the correct number of columns
	for (let y = 0; y < boardHeight; y++) {
		if (!Array.isArray(gameState.board[y])) {
			gameState.board[y] = [];
		}
		
		for (let x = 0; x < boardWidth; x++) {
			if (!gameState.board[y][x]) {
				gameState.board[y][x] = {
					x,
					y,
					type: null,
					playerId: null,
					inHomeZone: false
				};
			}
		}
	}
}

/**
 * Dispatch a game state update event
 */
function dispatchGameStateUpdateEvent() {
	if (typeof window !== 'undefined') {
		const event = new CustomEvent('gameStateUpdate', { 
			detail: gameState 
		});
		window.dispatchEvent(event);
	}
}

/**
 * Set the player ID
 * @param {string} id - The player ID
 */
export function setPlayerId(id) {
	playerId = id;
	gameState.playerId = id;
}

/**
 * Get the player ID
 * @returns {string} The player ID
 */
export function getPlayerId() {
	return playerId;
}

/**
 * Check if the game is paused
 * @returns {boolean} Whether the game is paused
 */
export function isGamePaused() {
	return gameState.isPaused;
}

/**
 * Set the game paused state
 * @param {boolean} paused - Whether the game is paused
 */
export function setGamePaused(paused) {
	gameState.isPaused = paused;
	dispatchGameStateUpdateEvent();
}

/**
 * Get a cell from the board
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @returns {Object|null} The cell or null if out of bounds
 */
export function getCell(x, y) {
	// Check if coordinates are valid
	if (x < 0 || x >= gameState.boardWidth || y < 0 || y >= gameState.boardHeight) {
		return null;
	}
	
	// Ensure the board is properly structured
	if (!gameState.board[y] || !gameState.board[y][x]) {
		return {
			x,
			y,
			type: null,
			playerId: null,
			inHomeZone: false
		};
	}
	
	return gameState.board[y][x];
}

/**
 * Set a cell on the board
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @param {Object} cell - The cell data
 */
export function setCell(x, y, cell) {
	// Check if coordinates are valid
	if (x < 0 || x >= gameState.boardWidth || y < 0 || y >= gameState.boardHeight) {
		return;
	}
	
	// Ensure the board is properly structured
	if (!gameState.board[y]) {
		gameState.board[y] = [];
	}
	
	// Set the cell
	gameState.board[y][x] = { ...cell, x, y };
	
	// Dispatch a game state update event
	dispatchGameStateUpdateEvent();
}

/**
 * Get a chess piece from the board
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @returns {Object|null} The chess piece or null if not found
 */
export function getChessPiece(x, y) {
	const cell = getCell(x, y);
	
	if (cell && cell.piece) {
		return { ...cell.piece, x, y };
	}
	
	return null;
}

/**
 * Set a chess piece on the board
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @param {Object} piece - The chess piece data
 */
export function setChessPiece(x, y, piece) {
	const cell = getCell(x, y);
	
	if (cell) {
		setCell(x, y, { ...cell, piece });
	}
}

/**
 * Remove a chess piece from the board
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 */
export function removeChessPiece(x, y) {
	const cell = getCell(x, y);
	
	if (cell) {
		const newCell = { ...cell };
		delete newCell.piece;
		setCell(x, y, newCell);
	}
}

/**
 * Check if a position is in a player's home zone
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @param {string} playerId - The player ID
 * @returns {boolean} Whether the position is in the player's home zone
 */
export function isInHomeZone(x, y, playerIdToCheck) {
	const playerToCheck = playerIdToCheck || playerId;
	const homeZone = gameState.homeZones[playerToCheck];
	
	if (!homeZone) return false;
	
	return x >= homeZone.x && 
		   x < homeZone.x + homeZone.width && 
		   y >= homeZone.y && 
		   y < homeZone.y + homeZone.height;
}

/**
 * Get a player's home zone
 * @param {string} playerIdToGet - The player ID
 * @returns {Object|null} The home zone or null if not found
 */
export function getHomeZone(playerIdToGet) {
	const playerToGet = playerIdToGet || playerId;
	return gameState.homeZones[playerToGet] || null;
}

/**
 * Set a player's home zone
 * @param {string} playerIdToSet - The player ID
 * @param {Object} homeZone - The home zone data
 */
export function setHomeZone(playerIdToSet, homeZone) {
	const playerToSet = playerIdToSet || playerId;
	gameState.homeZones[playerToSet] = homeZone;
	
	// Update cells in the home zone
	const { x, y, width, height } = homeZone;
	
	for (let cy = y; cy < y + height; cy++) {
		for (let cx = x; cx < x + width; cx++) {
			const cell = getCell(cx, cy);
			
			if (cell) {
				setCell(cx, cy, {
					...cell,
					inHomeZone: true,
					playerId: playerToSet
				});
			}
		}
	}
	
	// Dispatch a game state update event
	dispatchGameStateUpdateEvent();
}

/**
 * Get a player's resources
 * @param {string} playerIdToGet - The player ID
 * @returns {number} The player's resources
 */
export function getPlayerResources(playerIdToGet) {
	const playerToGet = playerIdToGet || playerId;
	return gameState.players[playerToGet]?.resources || 0;
}

/**
 * Set a player's resources
 * @param {string} playerIdToSet - The player ID
 * @param {number} resources - The resources amount
 */
export function setPlayerResources(playerIdToSet, resources) {
	const playerToSet = playerIdToSet || playerId;
	
	// Anti-cheat: Validate resources value
	if (typeof resources !== 'number' || resources < 0 || resources > 9999) {
		console.error('Invalid resources value:', resources);
		resources = Math.max(0, Math.min(9999, resources || 0));
	}
	
	if (!gameState.players[playerToSet]) {
		gameState.players[playerToSet] = {};
	}
	
	// Anti-cheat: Store the previous value to check for suspicious jumps
	const previousResources = gameState.players[playerToSet].resources || 0;
	
	// If this is a significant increase, check if it's valid
	if (resources > previousResources + 20 && playerToSet === playerId) {
		console.warn('Suspicious resource increase detected. Limiting increase.');
		resources = previousResources + 20;
	}
	
	gameState.players[playerToSet].resources = resources;
	
	// If connected to server, validate resources with server
	if (Network.isConnected() && !isOfflineMode() && playerToSet === playerId) {
		try {
			Network.emit('updateResources', {
				playerId: playerToSet,
				resources: resources
			});
		} catch (error) {
			console.error('Error sending resources update to server:', error);
		}
	}
	
	// Dispatch a game state update event
	dispatchGameStateUpdateEvent();
}

/**
 * Add resources to a player
 * @param {string} playerIdToAdd - The player ID
 * @param {number} amount - The amount to add
 */
export function addPlayerResources(playerIdToAdd, amount) {
	const playerToAdd = playerIdToAdd || playerId;
	const currentResources = getPlayerResources(playerToAdd);
	setPlayerResources(playerToAdd, currentResources + amount);
}

/**
 * Subtract resources from a player
 * @param {string} playerIdToSubtract - The player ID
 * @param {number} amount - The amount to subtract
 * @returns {boolean} Whether the subtraction was successful
 */
export function subtractPlayerResources(playerIdToSubtract, amount) {
	const playerToSubtract = playerIdToSubtract || playerId;
	const currentResources = getPlayerResources(playerToSubtract);
	
	if (currentResources < amount) {
		return false;
	}
	
	setPlayerResources(playerToSubtract, currentResources - amount);
	return true;
}

/**
 * Reset the game state
 */
export function resetGameState() {
	gameState = { ...DEFAULT_GAME_STATE, playerId };
	initializeBoard();
	dispatchGameStateUpdateEvent();
}

/**
 * Set offline mode
 * @param {boolean} offline - Whether the game is in offline mode
 */
export function setOfflineMode(offline) {
	gameState.offline = offline;
	dispatchGameStateUpdateEvent();
}

/**
 * Check if the game is in offline mode
 * @returns {boolean} Whether the game is in offline mode
 */
export function isOfflineMode() {
	return gameState.offline;
}

/**
 * Create a mock game state for offline mode
 * @returns {Object} The mock game state
 */
export function createMockGameState() {
	// Create a mock game state for offline mode
	const mockState = {
		...DEFAULT_GAME_STATE,
		gameId: 'offline-game',
		playerId,
		offline: true,
		players: {
			[playerId]: {
				name: 'You (Offline)',
				resources: 10,
				score: 0
			}
		}
	};
	
	// Create a home zone for the player
	mockState.homeZones = {
		[playerId]: {
			x: 0,
			y: mockState.boardHeight - 4,
			width: 4,
			height: 4
		}
	};
	
	// Initialize the board
	mockState.board = [];
	
	for (let y = 0; y < mockState.boardHeight; y++) {
		mockState.board[y] = [];
		for (let x = 0; x < mockState.boardWidth; x++) {
			mockState.board[y][x] = {
				x,
				y,
				type: null,
				playerId: null,
				inHomeZone: false
			};
		}
	}
	
	// Set home zone cells
	const homeZone = mockState.homeZones[playerId];
	
	for (let y = homeZone.y; y < homeZone.y + homeZone.height; y++) {
		for (let x = homeZone.x; x < homeZone.x + homeZone.width; x++) {
			mockState.board[y][x].inHomeZone = true;
			mockState.board[y][x].playerId = playerId;
		}
	}
	
	// Add a king in the home zone
	mockState.board[mockState.boardHeight - 2][1].piece = {
		type: 'king',
		playerId
	};
	
	// Add a pawn in the home zone
	mockState.board[mockState.boardHeight - 3][2].piece = {
		type: 'pawn',
		playerId
	};
	
	return mockState;
}

/**
 * Pause the game
 * @returns {boolean} Whether the pause was successful
 */
export async function pauseGame() {
	// If already paused, do nothing
	if (gameState.isPaused) {
		return true;
	}
	
	// If in offline mode, handle locally
	if (isOfflineMode()) {
		setGamePaused(true);
		return true;
	}
	
	try {
		// Send pause request to server
		await Network.emit('pauseGame', {
			playerId,
			gameId: gameState.gameId
		});
		
		// The server will send back the updated game state
		return true;
	} catch (error) {
		console.error('Error pausing game:', error);
		
		// If there's an error, handle locally
		setGamePaused(true);
		return true;
	}
}

/**
 * Resume the game
 * @returns {boolean} Whether the resume was successful
 */
export async function resumeGame() {
	// If not paused, do nothing
	if (!gameState.isPaused) {
		return true;
	}
	
	// If in offline mode, handle locally
	if (isOfflineMode()) {
		setGamePaused(false);
		return true;
	}
	
	try {
		// Send resume request to server
		await Network.emit('resumeGame', {
			playerId,
			gameId: gameState.gameId
		});
		
		// The server will send back the updated game state
		return true;
	} catch (error) {
		console.error('Error resuming game:', error);
		
		// If there's an error, handle locally
		setGamePaused(false);
		return true;
	}
}

/**
 * Update the score based on lines cleared
 * @param {number} linesCleared - Number of lines cleared in one move
 */
export function updateScore(linesCleared) {
	// Validate input
	if (typeof linesCleared !== 'number' || linesCleared < 0 || linesCleared > 4) {
		console.error('Invalid lines cleared value:', linesCleared);
		linesCleared = 0;
	}
	
	const gameState = getGameState();
	
	// Points per line based on number of lines cleared at once
	const pointsPerLine = {
		1: 40,    // Single line
		2: 100,   // Double line
		3: 300,   // Triple line
		4: 1200   // Tetris (four lines)
	};
	
	// Calculate points (base points * level)
	const points = (pointsPerLine[linesCleared] || 0) * gameState.level;
	
	// Anti-cheat: Store the previous score to check for suspicious jumps
	const previousScore = gameState.score || 0;
	const previousLinesCleared = gameState.linesCleared || 0;
	
	// Update score
	gameState.score += points;
	
	// Update lines cleared
	gameState.linesCleared += linesCleared;
	
	// Anti-cheat: Verify score change is valid
	if (gameState.score - previousScore > 1200 * gameState.level) {
		console.warn('Suspicious score increase detected. Reverting to safe values.');
		gameState.score = previousScore + (pointsPerLine[linesCleared] || 0) * gameState.level;
		gameState.linesCleared = previousLinesCleared + linesCleared;
	}
	
	// Check for level up
	if (gameState.linesCleared >= gameState.level * gameState.linesPerLevel) {
		gameState.level++;
		
		// Anti-cheat: Ensure level doesn't jump too high
		if (gameState.level > Math.floor(gameState.linesCleared / 10) + 1) {
			gameState.level = Math.floor(gameState.linesCleared / 10) + 1;
		}
		
		// Dispatch level up event
		if (typeof window !== 'undefined') {
			const levelUpEvent = new CustomEvent('levelUp', {
				detail: { level: gameState.level }
			});
			window.dispatchEvent(levelUpEvent);
		}
	}
	
	// Dispatch score update event
	if (typeof window !== 'undefined') {
		const scoreUpdateEvent = new CustomEvent('scoreUpdate', {
			detail: {
				score: gameState.score,
				linesCleared: gameState.linesCleared,
				level: gameState.level
			}
		});
		window.dispatchEvent(scoreUpdateEvent);
	}
	
	// Update game state
	updateGameState(gameState);
	
	// If connected to server, validate score with server
	if (Network.isConnected() && !isOfflineMode()) {
		try {
			Network.emit('updateScore', {
				playerId: getPlayerId(),
				score: gameState.score,
				linesCleared: gameState.linesCleared,
				level: gameState.level
			});
		} catch (error) {
			console.error('Error sending score update to server:', error);
		}
	}
	
	return points;
}

/**
 * Get the current game level
 * @returns {number} The current level
 */
export function getLevel() {
	return getGameState().level || 1;
}

/**
 * Get the current score
 * @returns {number} The current score
 */
export function getScore() {
	return getGameState().score || 0;
}

/**
 * Get the number of lines cleared
 * @returns {number} The number of lines cleared
 */
export function getLinesCleared() {
	return getGameState().linesCleared || 0;
}

/**
 * Set the game ID
 * @param {string} id - The game ID
 */
export function setGameId(id) {
	gameState.gameId = id;
}

/**
 * Get the game ID
 * @returns {string} The game ID
 */
export function getGameId() {
	return gameState.gameId;
}

/**
 * Set the board
 * @param {Array} board - The game board
 */
export function setBoard(board) {
	gameState.board = board;
}

/**
 * Get the board
 * @returns {Array} The game board
 */
export function getBoard() {
	return gameState.board;
}

/**
 * Set a player in the game state
 * @param {string} playerId - The player ID
 * @param {Object} playerData - The player data
 */
export function setPlayer(playerId, playerData) {
	if (!gameState.players) {
		gameState.players = {};
	}
	gameState.players[playerId] = playerData;
}

/**
 * Get all players
 * @returns {Object} All players
 */
export function getPlayers() {
	return gameState.players || {};
}

/**
 * Get the player's name
 * @param {string} id - The player ID (optional, defaults to current player)
 * @returns {string} The player's name
 */
export function getPlayerName(id = null) {
	// If no ID is provided, use the current player ID
	const playerId = id || getCurrentPlayerId();
	
	// Try to get the player from the game state
	if (gameState.players && gameState.players[playerId]) {
		return gameState.players[playerId].username || 'Anonymous';
	}
	
	// If not found in game state, try to get from session storage
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			const username = window.localStorage.getItem('username');
			if (username) {
				return username;
			}
		}
	} catch (e) {
		console.warn('Error accessing localStorage:', e);
	}
	
	// Fall back to a default name
	return 'Player ' + (playerId ? playerId.substring(0, 4) : Math.floor(Math.random() * 1000));
}

/**
 * Get the current player ID
 * @returns {string} The current player ID
 */
export function getCurrentPlayerId() {
	// Try to get from game state
	if (gameState.currentPlayerId) {
		return gameState.currentPlayerId;
	}
	
	// Try to get from session storage
	try {
		if (typeof window !== 'undefined' && window.localStorage) {
			const playerId = window.localStorage.getItem('player_id');
			if (playerId) {
				return playerId;
			}
		}
	} catch (e) {
		console.warn('Error accessing localStorage:', e);
	}
	
	// Fall back to a generated ID
	return 'player-' + Math.random().toString(36).substring(2, 9);
}

/**
 * Get all home zones
 * @returns {Object} All home zones
 */
export function getHomeZones() {
	return gameState.homeZones || {};
}

/**
 * Generate a unique ID
 * @returns {string} A UUID v4 string
 */
export function generateId() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

/**
 * Check if a cell is in a safe home zone (has pieces in it)
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {string} playerIdToCheck - Player ID to check
 * @returns {boolean} True if the cell is in a safe home zone
 */
export function isCellInSafeHomeZone(x, y, playerIdToCheck) {
	// First check if it's in a home zone at all
	if (!isInHomeZone(x, y, playerIdToCheck)) {
		return false;
	}
	
	// Get the player's home zone
	const homeZone = getHomeZone(playerIdToCheck);
	if (!homeZone) {
		return false;
	}
	
	// Check if there are any chess pieces in the home zone
	for (let i = 0; i < gameState.board.length; i++) {
		for (let j = 0; j < gameState.board[i].length; j++) {
			const cell = getCell(i, j);
			if (cell && isInHomeZone(i, j, playerIdToCheck) && cell.chessPiece) {
				return true;
			}
		}
	}
	
	return false;
}
