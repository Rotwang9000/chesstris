/**
 * Game Logic - Handles core game mechanics and rules
 */

import * as tetrominoManager from './tetrominoManager.js';
import * as boardManager from './boardManager.js';
import * as chessManager from './chessManager.js';
import { 
	getCurrentPlayer, 
	getGameState, 
	setGameState, 
	getCurrentTurnPhase,
	advanceTurnPhase,
	TURN_PHASES
} from './gameStateManager.js';
import { updateTurnIndicator } from './uiManager.js';

/**
 * Calculate the ghost piece position (where tetromino would land)
 * @param {Object} gameState - Current game state
 * @returns {Object} Position where the tetromino would land
 */
function calculateGhostPosition(gameState) {
	try {
		if (!gameState.currentTetromino) {
			return null;
		}
		
		const { board } = gameState;
		const { shape, position, type } = gameState.currentTetromino;
		
		// Create a copy of the current position
		const ghostPosition = {
			x: position.x,
			y: position.y,
			z: position.z
		};
		
		// Move the ghost piece down until it collides
		let collision = false;
		while (!collision) {
			// Check for collision at the next position
			ghostPosition.y -= 1;
			
			// If collision detected, move back up one step
			if (ghostPosition.y <= 0 || checkCollision(board, shape, ghostPosition)) {
				ghostPosition.y += 1;
				collision = true;
			}
		}
		
		// Only return the ghost position if it's different from the current position
		if (ghostPosition.y < position.y) {
			return ghostPosition;
		}
		
		return null;
	} catch (error) {
		console.error('Error calculating ghost position:', error);
		return null;
	}
}

/**
 * Update game state based on player input and game rules
 * @param {Object} gameState - Current game state
 * @param {Object} input - Player input
 * @param {number} deltaTime - Time since last update in ms
 * @returns {Object} Updated game state
 */
export function updateGameState(gameState, input, deltaTime) {
	try {
		if (!gameState) {
			console.error('No game state provided for update');
			return null;
		}
		
		// Create a copy of the game state to avoid direct modification
		const updatedGameState = { ...gameState };
		
		// Handle different game phases
		switch (updatedGameState.phase) {
			case 'TETROMINO':
				return handleTetrominoPhase(updatedGameState, input, deltaTime);
			case 'CHESS':
				return handleChessPhase(updatedGameState, input, deltaTime);
			case 'WAITING':
				return handleWaitingPhase(updatedGameState, input, deltaTime);
			default:
				console.warn(`Unknown game phase: ${updatedGameState.phase}`);
				return updatedGameState;
		}
	} catch (error) {
		console.error('Error updating game state:', error);
		return gameState;
	}
}

/**
 * Handle the tetromino phase of the game
 * @param {Object} gameState - Current game state
 * @param {Object} input - Player input
 * @param {number} deltaTime - Time since last update in ms
 * @returns {Object} Updated game state
 */
function handleTetrominoPhase(gameState, input, deltaTime) {
	const updatedGameState = { ...gameState };
	
	// Handle current tetromino
	if (updatedGameState.currentTetromino) {
		// Apply gravity to current tetromino
		const gravityResult = tetrominoManager.applyGravity(
			updatedGameState.currentTetromino,
			updatedGameState.board,
			deltaTime
		);
		
		// Update tetromino with gravity result
		updatedGameState.currentTetromino = gravityResult.tetromino;
		
		// Handle tetromino landing
		if (gravityResult.landed) {
			if (gravityResult.attached) {
				// Tetromino attached to board
				updatedGameState.board = tetrominoManager.placeTetromino(
					updatedGameState.currentTetromino,
					updatedGameState.board,
					updatedGameState.currentPlayer
				);
				
				// Check for completed rows
				const rowsToRemove = boardManager.findCompletedRows(updatedGameState.board);
				if (rowsToRemove.length > 0) {
					updatedGameState.board = boardManager.clearRows(updatedGameState.board, rowsToRemove);
				}
				
				// Transition to chess phase
				updatedGameState.phase = 'CHESS';
				updatedGameState.currentTetromino = null;
				
				// Signal that tetromino has attached
				updatedGameState.events.push({
					type: 'TETROMINO_ATTACHED',
					player: updatedGameState.currentPlayer,
					attachmentPoints: gravityResult.attachmentPoints
				});
			} else if (gravityResult.disintegrated) {
				// Tetromino disintegrated
				updatedGameState.currentTetromino = null;
				
				// Generate a new tetromino
				updatedGameState.currentTetromino = tetrominoManager.generateTetromino();
				
				// Signal that tetromino has disintegrated
				updatedGameState.events.push({
					type: 'TETROMINO_DISINTEGRATED',
					player: updatedGameState.currentPlayer
				});
			}
		}
		
		// Handle player input for tetromino movement
		if (input && updatedGameState.currentTetromino) {
			// Movement
			if (input.move) {
				const { x, z } = input.move;
				const movedTetromino = tetrominoManager.moveTetromino(
					updatedGameState.currentTetromino,
					{ x, z },
					updatedGameState.board
				);
				
				if (movedTetromino) {
					updatedGameState.currentTetromino = movedTetromino;
				}
			}
			
			// Rotation
			if (input.rotate) {
				const rotatedTetromino = tetrominoManager.rotateTetromino(
					updatedGameState.currentTetromino,
					input.rotate,
					updatedGameState.board
				);
				
				if (rotatedTetromino) {
					updatedGameState.currentTetromino = rotatedTetromino;
				}
			}
			
			// Hard drop
			if (input.hardDrop) {
				// Calculate ghost position
				const ghostPosition = tetrominoManager.calculateGhostPosition(
					updatedGameState.currentTetromino,
					updatedGameState.board
				);
				
				if (ghostPosition) {
					// Move tetromino to ghost position
					updatedGameState.currentTetromino.position = ghostPosition;
					
					// Check for magnetic attachment at y=0
					if (ghostPosition.y === 0) {
						const attachmentResult = tetrominoManager.checkMagneticAttachment(
							updatedGameState.currentTetromino,
							updatedGameState.board
						);
						
						if (attachmentResult.canAttach) {
							// Tetromino attached to board
							updatedGameState.board = tetrominoManager.placeTetromino(
								updatedGameState.currentTetromino,
								updatedGameState.board,
								updatedGameState.currentPlayer
							);
							
							// Check for completed rows
							const rowsToRemove = boardManager.findCompletedRows(updatedGameState.board);
							if (rowsToRemove.length > 0) {
								updatedGameState.board = boardManager.clearRows(updatedGameState.board, rowsToRemove);
							}
							
							// Transition to chess phase
							updatedGameState.phase = 'CHESS';
							updatedGameState.currentTetromino = null;
							
							// Signal that tetromino has attached
							updatedGameState.events.push({
								type: 'TETROMINO_ATTACHED',
								player: updatedGameState.currentPlayer,
								attachmentPoints: attachmentResult.attachmentPoints
							});
						}
					}
				}
			}
		}
	} else {
		// Generate a new tetromino if there isn't one
		updatedGameState.currentTetromino = tetrominoManager.generateTetromino();
		
		// Signal that a new tetromino has been generated
		updatedGameState.events.push({
			type: 'TETROMINO_GENERATED',
			player: updatedGameState.currentPlayer,
			tetromino: updatedGameState.currentTetromino.type
		});
	}
	
	// Update ghost piece position
	if (updatedGameState.currentTetromino) {
		updatedGameState.ghostPosition = tetrominoManager.calculateGhostPosition(
			updatedGameState.currentTetromino,
			updatedGameState.board
		);
	} else {
		updatedGameState.ghostPosition = null;
	}
	
	return updatedGameState;
}

/**
 * Lock the current tetromino in place on the board
 * @returns {boolean} Success status
 */
export function lockCurrentTetromino() {
	try {
		const gameState = getGameState();
		const currentPlayer = getCurrentPlayer();
		
		if (!gameState.currentTetromino || !currentPlayer) {
			console.warn('Cannot lock tetromino: No active tetromino or current player');
			return false;
		}
		
		// Check for magnetic attachment
		const attachmentResult = tetrominoManager.checkMagneticAttachment(
			gameState.currentTetromino,
			gameState.board
		);
		
		// If can't attach, don't proceed
		if (!attachmentResult.canAttach) {
			console.warn('Cannot lock tetromino: Not in a valid attachment position');
			return false;
		}
		
		// Place the tetromino on the board
		const updatedBoard = tetrominoManager.placeTetromino(
			gameState.currentTetromino, 
			gameState.board, 
			currentPlayer.id
		);
		
		// Check for completed rows
		const completedRows = boardManager.findCompletedRows(updatedBoard);
		
		// Clear completed rows and update the board
		const finalBoard = completedRows.length > 0 
			? boardManager.clearRows(updatedBoard, completedRows) 
			: updatedBoard;
		
		// Update game state
		setGameState({
			...gameState,
			board: finalBoard,
			currentTetromino: null,
			score: gameState.score + (completedRows.length * 100),
			lastAction: {
				type: 'tetromino_placed',
				playerId: currentPlayer.id,
				timestamp: Date.now(),
				completedRows
			}
		});
		
		// If we're in tetromino phase, advance to chess phase
		if (getCurrentTurnPhase() === TURN_PHASES.TETROMINO) {
			advanceTurnPhase();
			updateTurnIndicator();
		}
		
		return true;
	} catch (error) {
		console.error('Error locking tetromino:', error);
		return false;
	}
}

/**
 * Start a new tetromino phase
 * @returns {boolean} Success status
 */
export function startTetrominoPhase() {
	try {
		const gameState = getGameState();
		const currentPlayer = getCurrentPlayer();
		
		if (!currentPlayer) {
			console.warn('Cannot start tetromino phase: No current player');
			return false;
		}
		
		// Generate a new tetromino for the current player
		const newTetromino = tetrominoManager.generateTetromino({
			boardWidth: gameState.board[0].length,
			playerHomeZone: currentPlayer.homeZone
		});
		
		// Update game state with the new tetromino
		setGameState({
			...gameState,
			currentTetromino: newTetromino,
			lastAction: {
				type: 'tetromino_generated',
				playerId: currentPlayer.id,
				timestamp: Date.now()
			}
		});
		
		// Update turn indicator
		updateTurnIndicator();
		
		return true;
	} catch (error) {
		console.error('Error starting tetromino phase:', error);
		return false;
	}
}

/**
 * Initialize game settings
 * @returns {Object} Game settings
 */
function initializeGameSettings() {
	return {
		cellSize: 30,
		showGrid: true,
		showGhostPiece: true,
		renderMode: '3d', // '2d' or '3d'
		sound: {
			enabled: true,
			volume: 0.5
		},
		controls: {
			moveLeft: 'ArrowLeft',
			moveRight: 'ArrowRight',
			moveDown: 'ArrowDown',
			rotateClockwise: 'ArrowUp',
			rotateCCW: 'z',
			hardDrop: ' ',
			hold: 'c',
			pause: 'p'
		}
	};
} 