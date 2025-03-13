/**
 * Game State Module
 * Manages the game state, including board, players, and game settings
 */

// Game state object
const gameState = {
	board: [],
	players: [],
	settings: {
		boardSize: 8,
		gameMode: 'standard',
		difficulty: 'normal'
	},
	status: 'idle', // idle, playing, paused, gameOver
	score: 0,
	level: 1,
	activeTetromino: null
};

/**
 * Initialize the game state
 */
export function init() {
	console.log('Initializing game state');
	reset();
	return true;
}

/**
 * Reset the game state to default values
 */
export function reset() {
	console.log('Resetting game state');
	
	// Reset board
	const boardSize = gameState.settings.boardSize;
	gameState.board = [];
	
	for (let z = 0; z < boardSize; z++) {
		gameState.board[z] = [];
		for (let x = 0; x < boardSize; x++) {
			// Create a checkerboard pattern
			if ((x + z) % 2 === 0) {
				gameState.board[z][x] = {
					active: true,
					playerId: null,
					isHomeZone: x < 2 || x >= boardSize - 2
				};
			} else {
				gameState.board[z][x] = {
					active: false,
					playerId: null,
					isHomeZone: false
				};
			}
		}
	}
	
	// Reset players
	gameState.players = [];
	
	// Reset game status
	gameState.status = 'idle';
	gameState.score = 0;
	gameState.level = 1;
	gameState.activeTetromino = null;
	
	return true;
}

/**
 * Get the current game state
 * @returns {Object} The current game state
 */
export function getState() {
	return gameState;
}

/**
 * Get the current game state for compatibility
 * @returns {Object} The current game state
 */
export function getGameState() {
	return gameState;
}

/**
 * Set the board state
 * @param {Array} board - The new board state
 */
export function setBoard(board) {
	gameState.board = board;
}

/**
 * Add a player to the game
 * @param {Object} player - The player object
 */
export function addPlayer(player) {
	gameState.players.push(player);
}

/**
 * Update the game state
 * @param {Object} updates - The updates to apply to the game state
 */
export function updateState(updates) {
	Object.assign(gameState, updates);
}

/**
 * Set the active tetromino
 * @param {Object} tetromino - The active tetromino
 */
export function setActiveTetromino(tetromino) {
	gameState.activeTetromino = tetromino;
}

/**
 * Get the active tetromino
 * @returns {Object} The active tetromino
 */
export function getActiveTetromino() {
	return gameState.activeTetromino;
}

/**
 * Update the score
 * @param {Number} points - The points to add to the score
 */
export function updateScore(points) {
	gameState.score += points;
	
	// Update level based on score
	gameState.level = Math.floor(gameState.score / 1000) + 1;
}

/**
 * Set the game status
 * @param {String} status - The new game status
 */
export function setStatus(status) {
	gameState.status = status;
}

/**
 * Get the game status
 * @returns {String} The current game status
 */
export function getStatus() {
	return gameState.status;
}

// Make gameState available globally for debugging
window.GameState = {
	getGameState,
	setBoard,
	addPlayer,
	init,
	reset
}; 