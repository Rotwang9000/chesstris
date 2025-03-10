/**
 * Game State Module
 * Manages the state of the game
 */

// Import constants
import { Constants } from '../config/constants.js';

// Singleton game state
let gameState = null;

/**
 * Game State class
 * Manages the state of the game
 */
class GameStateManager {
	/**
	 * Initialize the game state
	 * @param {Object} initialState - Initial state (optional)
	 * @returns {Object} The game state
	 */
	static initGameState(initialState = null) {
		// Initialize with default state if not provided
		gameState = initialState || {
			board: [],
			players: {},
			fallingPiece: null,
			ghostPiece: null,
			cellSize: Constants.CELL_SIZE,
			cellDecorations: new Map()
		};
		
		// Initialize empty board if not provided
		if (!gameState.board || !gameState.board.length) {
			gameState.board = Array(Constants.BOARD_SIZE).fill(null).map(() => Array(Constants.BOARD_SIZE).fill(null));
		}
		
		console.log(`Game state initialized with board dimensions: ${gameState.board.length}x${gameState.board[0].length}`);
		
		return gameState;
	}
	
	/**
	 * Get the current game state
	 * @returns {Object} The game state
	 */
	static getGameState() {
		// Initialize if not already done
		if (!gameState) {
			return GameStateManager.initGameState();
		}
		
		return gameState;
	}
	
	/**
	 * Update the game state
	 * @param {Object} newState - New state to merge with current state
	 * @returns {Object} The updated game state
	 */
	static updateGameState(newState) {
		// Initialize if not already done
		if (!gameState) {
			gameState = GameStateManager.initGameState();
		}
		
		// Merge new state with current state
		gameState = { ...gameState, ...newState };
		
		return gameState;
	}
}

// Export the GameState class
export const GameState = GameStateManager;

// Default export
export default GameState; 