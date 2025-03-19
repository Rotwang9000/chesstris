/**
 * Game Manager
 * 
 * Handles the overall game state, initialization, and main game loop.
 */

import { GAME_CONSTANTS } from './constants.js';
import * as TetrominoManager from './tetrominoManager.js';
import * as ChessPieceManager from './chessPieceManager.js';
import * as PlayerManager from './playerManager.js';
import * as InputController from './inputController.js';
import * as Renderer from '../rendering/renderer.js';
import * as Network from '../utils/network.js';
import * as SessionManager from '../utils/sessionManager.js';
import * as DebugPanel from '../utils/debugPanel.js';
import * as SoundManager from '../utils/soundManager.js';

// Game state
let gameState = GAME_CONSTANTS.GAME_STATE.LOADING;
let isPaused = false;
let isGameOver = false;
let renderMode = GAME_CONSTANTS.RENDER_MODE.MODE_3D;
let score = 0;
let level = 1;
let lines = 0;
let gameSpeed = GAME_CONSTANTS.SPEED.NORMAL;
let lastUpdateTime = 0;
let deltaTime = 0;
let animationFrameId = null;
let board = null;

/**
 * Initialize the game
 * @param {Object} options - Game options
 */
export async function init(options = {}) {
	try {
		console.log('Initializing game...');
		
		// Set game state
		gameState = GAME_CONSTANTS.GAME_STATE.LOADING;
		isPaused = false;
		isGameOver = false;
		
		// Set render mode
		renderMode = options.renderMode || GAME_CONSTANTS.RENDER_MODE.MODE_3D;
		
		// Initialize session
		await SessionManager.initSession();
		
		// Initialize player
		PlayerManager.init({
			playerId: SessionManager.getPlayerId(),
			playerName: SessionManager.getPlayerName()
		});
		
		// Initialize network
		await Network.init();
		
		// Initialize board
		initBoard();
		
		// Initialize managers
		TetrominoManager.init({ board });
		ChessPieceManager.init({ board });
		InputController.init();
		
		// Initialize renderer
		Renderer.init({
			renderMode,
			board,
			container: options.container || document.getElementById('game-container')
		});
		
		// Initialize debug panel
		DebugPanel.init();
		
		// Initialize sound manager
		SoundManager.init();
		
		// Set initial game values
		score = 0;
		level = 1;
		lines = 0;
		gameSpeed = GAME_CONSTANTS.SPEED.NORMAL;
		
		// Set game state to ready
		gameState = GAME_CONSTANTS.GAME_STATE.READY;
		
		console.log('Game initialized');
		
		// Start game if autostart is enabled
		if (options.autostart) {
			startGame();
		}
	} catch (error) {
		console.error('Error initializing game:', error);
	}
}

/**
 * Initialize the game board
 */
function initBoard() {
	try {
		const width = GAME_CONSTANTS.BOARD_WIDTH;
		const height = GAME_CONSTANTS.BOARD_HEIGHT;
		
		// Create empty board
		board = Array(height).fill().map(() => Array(width).fill(null));
		
		console.log(`Board initialized (${width}x${height})`);
	} catch (error) {
		console.error('Error initializing board:', error);
	}
}

/**
 * Start the game
 */
export function startGame() {
	try {
		if (gameState === GAME_CONSTANTS.GAME_STATE.PLAYING) {
			console.warn('Game already started');
			return;
		}
		
		console.log('Starting game...');
		
		// Reset game values
		score = 0;
		level = 1;
		lines = 0;
		gameSpeed = GAME_CONSTANTS.SPEED.NORMAL;
		isPaused = false;
		isGameOver = false;
		
		// Reset managers
		TetrominoManager.reset();
		ChessPieceManager.reset();
		InputController.reset();
		
		// Clear board
		clearBoard();
		
		// Set up initial pieces
		ChessPieceManager.setupInitialPieces();
		
		// Set game state to playing
		gameState = GAME_CONSTANTS.GAME_STATE.PLAYING;
		
		// Start game loop
		lastUpdateTime = performance.now();
		if (!animationFrameId) {
			animationFrameId = requestAnimationFrame(gameLoop);
		}
		
		// Play start sound
		SoundManager.playSound('game_start');
		
		console.log('Game started');
	} catch (error) {
		console.error('Error starting game:', error);
	}
}

/**
 * Clear the game board
 */
function clearBoard() {
	try {
		const width = GAME_CONSTANTS.BOARD_WIDTH;
		const height = GAME_CONSTANTS.BOARD_HEIGHT;
		
		// Clear all cells
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				board[y][x] = null;
			}
		}
		
		console.log('Board cleared');
	} catch (error) {
		console.error('Error clearing board:', error);
	}
}

/**
 * Set the render mode
 * @param {string} mode - Render mode
 */
export function setRenderMode(mode) {
	try {
		if (Object.values(GAME_CONSTANTS.RENDER_MODE).includes(mode)) {
			// Only update if the mode is different
			if (renderMode !== mode) {
				console.log(`Changing render mode from ${renderMode} to ${mode}`);
				renderMode = mode;
				
				// Update renderer
				Renderer.init(mode).then(() => {
					console.log('Renderer initialized with mode:', mode);
					
					// Force a re-render of the game state
					if (gameState === GAME_CONSTANTS.GAME_STATE.PLAYING) {
						// Update the board
						if (ChessPieceManager && typeof ChessPieceManager.getBoard === 'function') {
							board = ChessPieceManager.getBoard();
							console.log('Board updated from ChessPieceManager');
						} else {
							console.warn('ChessPieceManager.getBoard not available');
						}
						
						// Update game state for rendering
						const currentGameState = getGameState();
						
						// Trigger a render with the current game state
						render(currentGameState);
						
						console.log('Game state re-rendered after mode change');
					} else {
						console.log('Game not in playing state, skipping re-render');
					}
				}).catch(error => {
					console.error('Error initializing renderer:', error);
				});
			} else {
				console.log('Render mode unchanged:', mode);
			}
		} else {
			console.error('Invalid render mode:', mode);
		}
	} catch (error) {
		console.error('Error setting render mode:', error);
	}
}

/**
 * Pause the game
 */
export function pauseGame() {
	try {
		if (gameState !== GAME_CONSTANTS.GAME_STATE.PLAYING || isGameOver) {
			return;
		}
		
		console.log('Pausing game...');
		
		isPaused = true;
		gameState = GAME_CONSTANTS.GAME_STATE.PAUSED;
		
		// Play pause sound
		SoundManager.playSound('pause');
		
		console.log('Game paused');
	} catch (error) {
		console.error('Error pausing game:', error);
	}
}

/**
 * Resume the game
 */
export function resumeGame() {
	try {
		if (gameState !== GAME_CONSTANTS.GAME_STATE.PAUSED || isGameOver) {
			return;
		}
		
		console.log('Resuming game...');
		
		isPaused = false;
		gameState = GAME_CONSTANTS.GAME_STATE.PLAYING;
		
		// Reset last update time to avoid large delta
		lastUpdateTime = performance.now();
		
		// Play resume sound
		SoundManager.playSound('resume');
		
		console.log('Game resumed');
	} catch (error) {
		console.error('Error resuming game:', error);
	}
}

/**
 * End the game
 */
export function endGame() {
	try {
		if (gameState !== GAME_CONSTANTS.GAME_STATE.PLAYING && gameState !== GAME_CONSTANTS.GAME_STATE.PAUSED) {
			return;
		}
		
		console.log('Ending game...');
		
		isGameOver = true;
		gameState = GAME_CONSTANTS.GAME_STATE.GAME_OVER;
		
		// Save high score
		const highScore = {
			score,
			level,
			lines,
			date: new Date().toISOString(),
			playerId: PlayerManager.getPlayerId(),
			playerName: PlayerManager.getPlayerName()
		};
		
		// Save to session
		SessionManager.saveHighScore(highScore);
		
		// Play game over sound
		SoundManager.playSound('game_over');
		
		console.log('Game ended');
	} catch (error) {
		console.error('Error ending game:', error);
	}
}

/**
 * Restart the game
 */
export function restartGame() {
	try {
		console.log('Restarting game...');
		
		// Reset game state
		isGameOver = false;
		isPaused = false;
		
		// Start new game
		startGame();
		
		console.log('Game restarted');
	} catch (error) {
		console.error('Error restarting game:', error);
	}
}

/**
 * Main game loop
 * @param {number} timestamp - Current timestamp
 */
function gameLoop(timestamp) {
	try {
		// Calculate delta time
		deltaTime = timestamp - lastUpdateTime;
		lastUpdateTime = timestamp;
		
		// Update game
		updateGame(deltaTime);
		
		// Render game
		render();
		
		// Continue loop
		animationFrameId = requestAnimationFrame(gameLoop);
	} catch (error) {
		console.error('Error in game loop:', error);
	}
}

/**
 * Update game state
 * @param {number} deltaTime - Time since last update in milliseconds
 */
function updateGame(deltaTime) {
	try {
		// Skip update if paused or game over
		if (isPaused || isGameOver) {
			return;
		}
		
		// Update input
		InputController.update(deltaTime);
		
		// Update tetromino
		TetrominoManager.update(deltaTime);
		
		// Update chess pieces
		ChessPieceManager.update(deltaTime);
		
		// Update player
		PlayerManager.update(deltaTime);
		
		// Update debug panel
		DebugPanel.update();
	} catch (error) {
		console.error('Error updating game:', error);
	}
}

/**
 * Public update function for external use
 * @param {number} [customDeltaTime] - Optional custom delta time
 */
export function update(customDeltaTime) {
	// Calculate delta time if not provided
	const deltaTime = customDeltaTime || (performance.now() - lastUpdateTime);
	lastUpdateTime = performance.now();
	
	// Call internal update function
	updateGame(deltaTime);
}

/**
 * Render the game
 * @param {Object} customGameState - Optional custom game state to render
 */
function render(customGameState) {
	try {
		// Use custom game state if provided, otherwise build one
		const gameStateToRender = customGameState || {
			board: board,
			fallingPiece: TetrominoManager.getFallingPiece ? TetrominoManager.getFallingPiece() : null,
			ghostPiece: TetrominoManager.getGhostPiece ? TetrominoManager.getGhostPiece() : null,
			nextPiece: TetrominoManager.getNextPiece ? TetrominoManager.getNextPiece() : null,
			heldPiece: TetrominoManager.getHeldPiece ? TetrominoManager.getHeldPiece() : null,
			chessPieces: ChessPieceManager.getChessPieces ? ChessPieceManager.getChessPieces() : {},
			selectedChessPiece: ChessPieceManager.getSelectedPiece ? ChessPieceManager.getSelectedPiece() : null,
			validMoves: ChessPieceManager.getValidMoves ? ChessPieceManager.getValidMoves() : [],
			score: score,
			level: level,
			lines: lines,
			isPaused: isPaused,
			isGameOver: isGameOver,
			renderMode: renderMode
		};
		
		// Log the game state being rendered
		// console.log('Rendering game state:', {
		// 	boardExists: !!gameStateToRender.board,
		// 	fallingPiece: !!gameStateToRender.fallingPiece,
		// 	chessPiecesCount: Object.keys(gameStateToRender.chessPieces || {}).length,
		// 	renderMode: gameStateToRender.renderMode
		// });
		
		// Render the game state
		Renderer.render(gameStateToRender);
	} catch (error) {
		console.error('Error rendering game:', error);
	}
}

/**
 * Add score to the game
 * @param {number} points - Points to add
 * @param {string} type - Type of score (e.g., 'single', 'tetris', 'chess_capture')
 */
export function addScore(points, type) {
	try {
		// Add score
		score += points;
		
		// Update player score
		PlayerManager.addScore(points);
		
		// Play score sound
		SoundManager.playSound('score');
		
		console.log(`Added ${points} points (${type})`);
	} catch (error) {
		console.error('Error adding score:', error);
	}
}

/**
 * Add lines to the game
 * @param {number} clearedLines - Number of lines cleared
 */
export function addLines(clearedLines) {
	try {
		// Add lines
		lines += clearedLines;
		
		// Update player lines
		PlayerManager.addLines(clearedLines);
		
		// Check for level up
		const newLevel = Math.floor(lines / GAME_CONSTANTS.SETTINGS.LINES_PER_LEVEL) + 1;
		if (newLevel > level) {
			levelUp(newLevel);
		}
		
		console.log(`Added ${clearedLines} lines`);
	} catch (error) {
		console.error('Error adding lines:', error);
	}
}

/**
 * Level up the game
 * @param {number} newLevel - New level
 */
function levelUp(newLevel) {
	try {
		// Set new level
		level = newLevel;
		
		// Update player level
		PlayerManager.setLevel(newLevel);
		
		// Update game speed
		updateGameSpeed();
		
		// Play level up sound
		SoundManager.playSound('level_up');
		
		console.log(`Leveled up to ${newLevel}`);
	} catch (error) {
		console.error('Error leveling up:', error);
	}
}

/**
 * Update game speed based on level
 */
function updateGameSpeed() {
	try {
		// Calculate new speed
		const speedFactor = Math.pow(GAME_CONSTANTS.SETTINGS.GRAVITY_FACTOR, level - 1);
		gameSpeed = Math.max(GAME_CONSTANTS.SPEED.TURBO, GAME_CONSTANTS.SPEED.NORMAL * speedFactor);
		
		console.log(`Game speed updated to ${gameSpeed}ms per tick`);
	} catch (error) {
		console.error('Error updating game speed:', error);
	}
}

/**
 * Check if a position is valid on the board
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} - Whether the position is valid
 */
export function isValidPosition(x, y) {
	try {
		return x >= 0 && x < GAME_CONSTANTS.BOARD_WIDTH && y >= 0 && y < GAME_CONSTANTS.BOARD_HEIGHT;
	} catch (error) {
		console.error('Error checking valid position:', error);
		return false;
	}
}

/**
 * Check if a position is empty on the board
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} - Whether the position is empty
 */
export function isEmptyPosition(x, y) {
	try {
		return isValidPosition(x, y) && board[y][x] === null;
	} catch (error) {
		console.error('Error checking empty position:', error);
		return false;
	}
}

/**
 * Get the cell at a position on the board
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {*} - Cell at the position
 */
export function getCell(x, y) {
	try {
		if (isValidPosition(x, y)) {
			return board[y][x];
		}
		return null;
	} catch (error) {
		console.error('Error getting cell:', error);
		return null;
	}
}

/**
 * Set the cell at a position on the board
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {*} value - Value to set
 */
export function setCell(x, y, value) {
	try {
		if (isValidPosition(x, y)) {
			board[y][x] = value;
		}
	} catch (error) {
		console.error('Error setting cell:', error);
	}
}

/**
 * Get the game state
 * @returns {Object} - Complete game state object
 */
export function getGameState() {
	// Create a comprehensive game state object
	return {
		gameState: gameState,
		isPaused: isPaused,
		isGameOver: isGameOver,
		renderMode: renderMode,
		score: score,
		level: level,
		lines: lines,
		gameSpeed: gameSpeed,
		board: board || ChessPieceManager.getBoard(),
		fallingPiece: TetrominoManager.getFallingPiece(),
		ghostPiece: TetrominoManager.getGhostPiece(),
		nextPiece: TetrominoManager.getNextPiece(),
		heldPiece: TetrominoManager.getHeldPiece(),
		homeZones: ChessPieceManager.getHomeZones(),
		chessPieces: ChessPieceManager.getChessPieces()
	};
}

/**
 * Check if the game is paused
 * @returns {boolean} - Whether the game is paused
 */
export function gameIsPaused() {
	return isPaused;
}

/**
 * Get the game over state
 * @returns {boolean} - Whether the game is over
 */
export function getGameOverState() {
	return isGameOver;
}

/**
 * Get the render mode
 * @returns {string} - Render mode
 */
export function getRenderMode() {
	return renderMode;
}

/**
 * Get the game score
 * @returns {number} - Game score
 */
export function getScore() {
	return score;
}

/**
 * Get the game level
 * @returns {number} - Game level
 */
export function getLevel() {
	return level;
}

/**
 * Get the game lines
 * @returns {number} - Game lines
 */
export function getLines() {
	return lines;
}

/**
 * Get the game speed
 * @returns {number} - Game speed
 */
export function getGameSpeed() {
	return gameSpeed;
}

/**
 * Get the game board
 * @returns {Array} - Game board
 */
export function getBoard() {
	return board;
}

/**
 * Get the delta time
 * @returns {number} - Delta time
 */
export function getDeltaTime() {
	return deltaTime;
}

/**
 * Clean up the game
 */
export function cleanup() {
	try {
		console.log('Cleaning up game...');
		
		// Cancel animation frame
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		
		// Clean up managers
		TetrominoManager.cleanup();
		ChessPieceManager.cleanup();
		InputController.detachEventListeners();
		Renderer.cleanup();
		SoundManager.cleanup();
		
		console.log('Game cleaned up');
	} catch (error) {
		console.error('Error cleaning up game:', error);
	}
}

/**
 * Check if the game is currently running
 * @returns {boolean} - Whether the game is running
 */
export function isGameRunning() {
	return gameState === GAME_CONSTANTS.GAME_STATE.PLAYING && !isPaused && !isGameOver;
}

/**
 * Initialize the game with the given options
 * @param {Object} options - Game options
 * @returns {Promise<boolean>} - Whether initialization was successful
 */
export async function initGame(options = {}) {
	try {
		console.log('Initializing game with options:', options);
		
		// Call the main init function
		await init(options);
		
		// Initialize the board
		if (ChessPieceManager && ChessPieceManager.getBoard) {
			board = ChessPieceManager.getBoard();
		}
		
		// Start the game loop
		startGameLoop();
		
		// Set game state to ready
		gameState = GAME_CONSTANTS.GAME_STATE.READY;
		
		console.log('Game initialized successfully');
		return true;
	} catch (error) {
		console.error('Error initializing game:', error);
		return false;
	}
}

/**
 * Check if the king has been captured and handle game over
 * @param {Object} capturedPiece - The captured piece
 * @param {Object} capturedBy - The piece that captured
 */
export function checkKingCaptured(capturedPiece, capturedBy) {
	try {
		// Check if the captured piece is a king
		if (capturedPiece && capturedPiece.type === 'king') {
			console.log('King captured! Game over.');
			
			// Set game state to game over
			gameState.state = GAME_CONSTANTS.GAME_STATE.GAME_OVER;
			
			// Dispatch game over event
			const gameOverEvent = new CustomEvent('game-state-change', {
				detail: {
					state: GAME_CONSTANTS.GAME_STATE.GAME_OVER,
					data: {
						reason: 'king_captured',
						capturedPiece,
						capturedBy,
						capturedPieces: ChessPieceManager.getCapturedPiecesCount(),
						score: getScore(),
						level: getLevel()
					}
				}
			});
			
			window.dispatchEvent(gameOverEvent);
		}
	} catch (error) {
		console.error('Error checking king captured:', error);
	}
}

/**
 * Check if the board is full and handle game over
 */
export function checkBoardFull() {
	try {
		// Get the board state
		const board = ChessPieceManager.getBoard();
		
		// Check if the board is full (no empty cells)
		let isFull = true;
		for (let y = 0; y < GAME_CONSTANTS.BOARD_HEIGHT; y++) {
			for (let x = 0; x < GAME_CONSTANTS.BOARD_WIDTH; x++) {
				if (!board[y][x] || board[y][x].isEmpty) {
					isFull = false;
					break;
				}
			}
			if (!isFull) break;
		}
		
		if (isFull) {
			console.log('Board is full! Game over.');
			
			// Set game state to game over
			gameState.state = GAME_CONSTANTS.GAME_STATE.GAME_OVER;
			
			// Dispatch game over event
			const gameOverEvent = new CustomEvent('game-state-change', {
				detail: {
					state: GAME_CONSTANTS.GAME_STATE.GAME_OVER,
					data: {
						reason: 'board_full',
						capturedPieces: ChessPieceManager.getCapturedPiecesCount(),
						score: getScore(),
						level: getLevel()
					}
				}
			});
			
			window.dispatchEvent(gameOverEvent);
		}
	} catch (error) {
		console.error('Error checking if board is full:', error);
	}
}
