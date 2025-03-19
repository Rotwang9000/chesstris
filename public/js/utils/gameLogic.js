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
 * Update game state with frame-based logic
 * @param {Object} gameState - Current game state
 * @param {number} deltaTime - Time since last frame (in milliseconds)
 * @returns {Object} Updated game state
 */
function updateGameState(gameState, deltaTime) {
	try {
		if (!gameState) {
			return null;
		}
		
		// Create a copy of the game state
		const updatedGameState = { ...gameState };
		
		// Update tetromino fall logic
		if (updatedGameState.currentTetromino && !updatedGameState.gameOver) {
			// Update fall timer
			updatedGameState.fallTimer = (updatedGameState.fallTimer || 0) + deltaTime;
			
			// Get fall interval based on level
			const fallInterval = getFallInterval(updatedGameState.level || 1);
			
			// Move tetromino down if interval has passed
			if (updatedGameState.fallTimer >= fallInterval) {
				// Reset timer
				updatedGameState.fallTimer = 0;
				
				// Create new position
				const newPosition = {
					x: updatedGameState.currentTetromino.position.x,
					y: updatedGameState.currentTetromino.position.y - 1,
					z: updatedGameState.currentTetromino.position.z
				};
				
				// Check for collision
				if (checkCollision(updatedGameState.board, updatedGameState.currentTetromino.shape, newPosition)) {
					// Tetromino has landed
					lockTetromino(updatedGameState);
					
					// Check for completed lines
					const linesCleared = checkLines(updatedGameState);
					
					// Update score
					if (linesCleared > 0) {
						updateScore(updatedGameState, linesCleared);
					}
					
					// Spawn next tetromino if available
					if (updatedGameState.nextTetromino) {
						updatedGameState.currentTetromino = updatedGameState.nextTetromino;
						updatedGameState.nextTetromino = generateRandomTetromino();
					} else {
						// Game over if no next tetromino (shouldn't happen normally)
						updatedGameState.currentTetromino = null;
						updatedGameState.gameOver = true;
					}
				} else {
					// Move tetromino down
					updatedGameState.currentTetromino.position = newPosition;
				}
			}
			
			// Calculate ghost position (where tetromino would land)
			if (updatedGameState.currentTetromino) {
				updatedGameState.ghostPosition = calculateGhostPosition(updatedGameState);
			} else {
				updatedGameState.ghostPosition = null;
			}
		}
		
		return updatedGameState;
	} catch (error) {
		console.error('Error updating game state:', error);
		return gameState;
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