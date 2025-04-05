import { updateGameStatusDisplay } from './createLoadingIndicator';
import { getTHREE, PLAYER_COLORS } from './enhanced-gameCore';
import { showToastMessage } from './showToastMessage';
import NetworkManager from './utils/networkManager.js';
import { boardFunctions } from './boardFunctions.js';
import { toRelativePosition, toAbsolutePosition, translatePosition } from './centreBoardMarker.js';
// Import the gameState singleton at the top of the file
import gameState from './utils/gameState.js';

/**
 * Shaktris 3D Coordinate System
 * ==============================
 * The game uses a standard 3D coordinate system where:
 * 
 * X-axis: Runs horizontally left to right across the board (left is negative, right is positive)
 * Y-axis: Runs vertically from bottom to top (up is positive, down is negative)
 *         Y=0 is the board surface, heightAboveBoard represents position above the board
 * Z-axis: Runs horizontally from front to back (toward camera is negative, away from camera is positive)
 * 
 * Movement functions:
 * - moveTetrominoX: Moves the tetromino left/right along the X-axis
 * - moveTetrominoY: Moves the tetromino up/down along the Y-axis (changing heightAboveBoard)
 * - moveTetrominoForwardBack: Moves the tetromino forward/backward along the Z-axis
 * 
 * The chess pieces and tetromino blocks both exist on the XZ plane when placed on the board.
 */

// Object pool for frequently used game objects
const objectPool = {
	tetrominoBlocks: [],
	maxPoolSize: 100, // Maximum number of objects to keep in pool

	// Get block from pool or create new
	getTetrominoBlock: function () {
		if (this.tetrominoBlocks.length > 0) {
			return this.tetrominoBlocks.pop();
		}
		const THREE = getTHREE();

		// Create new block
		const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
		const material = new THREE.MeshStandardMaterial({
			color: 0xffffff, // Will be set later
			metalness: 0.3,
			roughness: 0.7,
			transparent: false
		});

		const mesh = new THREE.Mesh(geometry, material);
		return mesh;
	},

	// Return block to pool
	returnTetrominoBlock: function (mesh) {
		// Don't exceed max pool size
		if (this.tetrominoBlocks.length >= this.maxPoolSize) {
			// Dispose properly
			if (mesh.geometry) mesh.geometry.dispose();
			if (mesh.material) mesh.material.dispose();
			return;
		}

		// Reset properties for reuse
		mesh.visible = true;
		mesh.scale.set(1, 1, 1);
		mesh.position.set(0, 0, 0);

		// Add to pool
		this.tetrominoBlocks.push(mesh);
	},

	// Clear pool (call when changing levels or scenes)
	clearPool: function () {
		while (this.tetrominoBlocks.length > 0) {
			const mesh = this.tetrominoBlocks.pop();
			if (mesh.geometry) mesh.geometry.dispose();
			if (mesh.material) mesh.material.dispose();
		}
	},
	
	// Preload tetromino blocks to fill the pool
	preloadTetrominoBlocks: function(count = 50) {
		console.log(`Preloading ${count} tetromino blocks for object pool`);
		const THREE = getTHREE();
		
		// Fill the pool up to the specified count
		const currentCount = this.tetrominoBlocks.length;
		const neededCount = Math.min(count, this.maxPoolSize) - currentCount;
		
		if (neededCount <= 0) {
			console.log('Object pool already filled, no preloading needed');
			return;
		}
		
		// Create blocks and add to pool
		for (let i = 0; i < neededCount; i++) {
			const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
			const material = new THREE.MeshStandardMaterial({
				color: 0xffffff,
				metalness: 0.3,
				roughness: 0.7,
				transparent: false
			});
			
			const mesh = new THREE.Mesh(geometry, material);
			this.tetrominoBlocks.push(mesh);
		}
		
		console.log(`Preloaded ${neededCount} blocks, pool now contains ${this.tetrominoBlocks.length} blocks`);
	}
};


/**
 * Move the current tetromino horizontally along X-axis (left/right)
 * @param {number} dir - Direction (-1 for left, 1 for right)
 * @returns {boolean} - Whether the move was successful
 */
export function moveTetrominoHorizontal(dir, isXAxis = true) {
	// Multiple safety checks to prevent lockups
	if (!gameState) return false;
	if (!gameState.currentTetromino) return false;
	
	// Prevent movement if we're in the chess phase
	if (gameState.turnPhase !== 'tetris') return false;
	
	// Prevent movement during hard drop processing
	if (gameState.isProcessingHardDrop) return false;
	
	// Prevent multiple simultaneously movements 
	if (gameState.isMovingTetromino) return false;
	gameState.isMovingTetromino = true;
	
	try {
		// Make a copy of the current position
		const newPos = {
			x: isXAxis ? gameState.currentTetromino.position.x + dir : gameState.currentTetromino.position.x,
			z: isXAxis ? gameState.currentTetromino.position.z : gameState.currentTetromino.position.z + dir
		};
		
		// If we're at or near board level (heightAboveBoard <= 1), check adjacent cells
		// to prevent movement of pieces that should be exploding
		if (gameState.currentTetromino.heightAboveBoard <= 1) {
			// Check if the tetromino is adjacent to any existing cells at the new position
			const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(
				gameState,
				gameState.currentTetromino.shape,
				newPos.x,
				newPos.z
			);
			
			// If not adjacent at the new position and at or near ground level, don't allow movement
			// This prevents moving pieces that should be exploding
			if (!isAdjacent) {
				console.log(`Horizontal move rejected - tetromino at Y=${gameState.currentTetromino.heightAboveBoard} is not adjacent to any cells at new position`);
				
				// Trigger cleanup if we're at board level
				if (gameState.currentTetromino.heightAboveBoard <= 1) {
					// Use setTimeout to avoid race conditions
					setTimeout(() => {
						const explosionX = gameState.currentTetromino.position.x;
						const explosionZ = gameState.currentTetromino.position.z;
						cleanupTetrominoAndTransitionToChess(
							gameState,
							'Tetromino must connect to existing cells',
							explosionX,
							explosionZ
						);
					}, 0);
				}
				
				return false;
			}
		}
		
		// Update position
		gameState.currentTetromino.position = newPos;
		
		// If we have a shape group, move it directly rather than re-rendering
		if (gameState.currentTetrominoShapeGroup) {
			// Get absolute position
			const absPos = translatePosition(newPos, gameState, true);
			
			// Update the position of the shape group
			gameState.currentTetrominoShapeGroup.position.x = absPos.x;
			gameState.currentTetrominoShapeGroup.position.z = absPos.z;
		} else {
			// Fall back to re-rendering if needed
			renderTetromino(gameState);
		}
		
		return true;
	} catch (error) {
		console.error('Error in moveTetrominoHorizontal:', error);
		return false;
	} finally {
		// Always make sure to reset the moving flag
		gameState.isMovingTetromino = false;
	}
}


/**
 * Move the current tetromino forward/backward along Z-axis on the board
 * @param {number} dir - Direction (-1 for forward/toward camera, 1 for backward/away from camera)
 * @returns {boolean} - Whether the move was successful
 */
export function moveTetrominoForwardBack(dir, gameState) {
	return moveTetrominoHorizontal(dir, false);
}

/**
 * Show drop animation for hard drops
 */
function showDropAnimation(gameState) {
	if (!gameState.currentTetromino) return;

	// Create animation element
	const animElement = document.createElement('div');
	animElement.style.position = 'fixed';
	animElement.style.top = '50%';
	animElement.style.left = '50%';
	animElement.style.transform = 'translate(-50%, -50%)';
	animElement.style.color = 'cyan';
	animElement.style.fontSize = '48px';
	animElement.style.fontWeight = 'bold';
	animElement.style.textShadow = '0 0 10px rgba(0,200,255,0.8)';
	animElement.style.zIndex = '1000';
	animElement.style.pointerEvents = 'none';
	animElement.style.opacity = '0';
	animElement.style.transition = 'all 0.3s';
	animElement.textContent = 'DROP!';

	document.body.appendChild(animElement);

	// Animation sequence
	setTimeout(() => {
		animElement.style.opacity = '1';
		animElement.style.fontSize = '72px';
	}, 50);

	setTimeout(() => {
		animElement.style.opacity = '0';
	}, 400);

	setTimeout(() => {
		document.body.removeChild(animElement);
	}, 700);
}
/**
 * Show explosion animation for tetromino collisions
 * @param {number} x - X position (board coordinates)
 * @param {number} z - Z position (board coordinates)
 * @param {Object} gameState - The current game state
 */
function showExplosionAnimation(x, z, gameState) {
	console.log(`Creating explosion at board position x=${x}, z=${z}`);
	
	const THREE = getTHREE();
	// Create particle group
	const particleGroup = new THREE.Group();
	particleGroup.name = 'explosion-' + Date.now();
	
	// First ensure we have a valid scene
	if (!gameState.scene) {
		console.error('No scene available for explosion animation');
		return;
	}
	
	// Add particle group to scene
	gameState.scene.add(particleGroup);
	
	// Play explosion sound if available
	if (typeof playSound === 'function') {
		playSound('explosion');
	}

	// Create particles
	const particleCount = 40; // Increased particle count
	const particles = [];
	
	// Calculate the center of the explosion (for a shape that spans multiple cells)
	// We'll use the provided x,z as the top-left corner and assume a 2x2 area for better visual effect
	const centerX = x + 1;
	const centerZ = z + 1;
	
	console.log(`Explosion center calculated at (${centerX}, ${centerZ})`);
	
	for (let i = 0; i < particleCount; i++) {
		const size = Math.random() * 0.4 + 0.1; // Slightly larger particles
		const geometry = new THREE.BoxGeometry(size, size, size);
		
		// Use player color for some particles, random bright colors for others
		const usePlayerColor = Math.random() > 0.5;
		let color;
		
		if (usePlayerColor && gameState.currentPlayer && PLAYER_COLORS[gameState.currentPlayer]) {
			color = new THREE.Color(PLAYER_COLORS[gameState.currentPlayer]);
		} else {
			// Bright explosion colors - reds, oranges, yellows
			color = new THREE.Color().setHSL(
				Math.random() * 0.1 + 0.05, // Red to yellow hues
				0.8,
				0.6
			);
		}
		
		const material = new THREE.MeshBasicMaterial({
			color: color,
			transparent: true,
			opacity: 0.9
		});

		const particle = new THREE.Mesh(geometry, material);
		
		// Position particles centered on the explosion point for more consistent effect
		particle.position.set(
			centerX + Math.random() * 2 - 1,  // More focused spread
			Math.random() * 2 + 0.5,    // Height spread
			centerZ + Math.random() * 2 - 1   // More focused spread
		);

		// Add velocity for animation with more force
		particle.userData.velocity = {
			x: Math.random() * 0.3 - 0.15,
			y: Math.random() * 0.4 + 0.2, // Higher initial upward velocity
			z: Math.random() * 0.3 - 0.15
		};

		// Add rotation for more dynamic effect
		particle.userData.rotation = {
			x: (Math.random() - 0.5) * 0.2,
			y: (Math.random() - 0.5) * 0.2,
			z: (Math.random() - 0.5) * 0.2
		};

		particleGroup.add(particle);
		particles.push(particle);
	}

	// Add a flash effect
	const flashGeometry = new THREE.PlaneGeometry(4, 4); // Smaller, more focused flash
	const flashMaterial = new THREE.MeshBasicMaterial({
		color: 0xFFFFFF,
		transparent: true,
		opacity: 0.8,
		side: THREE.DoubleSide
	});
	
	// Position the flash directly at the center point for consistency
	const flash = new THREE.Mesh(flashGeometry, flashMaterial);
	flash.position.set(centerX, 0.5, centerZ); // Lower height for better visibility
	flash.rotation.x = Math.PI / 2; // Flat on the board
	particleGroup.add(flash);
	particles.push(flash);
	
	// Animate the explosion
	let lifetime = 0;
	let animationFrameId = null;
	
	// Ensure this animation doesn't get stuck if the page changes
	const maxLifetime = 40;
	const startTime = Date.now();
	
	const animate = () => {
		// Check if animation has been running too long
		if (Date.now() - startTime > 2000) {
			console.warn('Explosion animation timed out, cleaning up');
			cleanup();
			return;
		}
		
		lifetime++;

		// Update particles
		particleGroup.children.forEach(particle => {
			// Skip the flash plane
			if (particle.geometry instanceof THREE.PlaneGeometry) {
				particle.material.opacity = 0.8 * Math.max(0, 1 - (lifetime * 2 / 30));
				return;
			}
			
			// Apply velocity
			particle.position.x += particle.userData.velocity.x;
			particle.position.y += particle.userData.velocity.y;
			particle.position.z += particle.userData.velocity.z;

			// Apply rotation if available
			if (particle.userData.rotation) {
				particle.rotation.x += particle.userData.rotation.x;
				particle.rotation.y += particle.userData.rotation.y;
				particle.rotation.z += particle.userData.rotation.z;
			}

			// Apply gravity (stronger gravity)
			particle.userData.velocity.y -= 0.015;

			// Fade out
			if (particle.material) {
				particle.material.opacity = 0.9 * (1 - lifetime / maxLifetime);
			}
		});

		// Force render update to show the animation
		if (gameState.renderer && gameState.scene && gameState.camera) {
			gameState.renderer.render(gameState.scene, gameState.camera);
		}

		// Continue animation if not done
		if (lifetime < maxLifetime) { // Longer animation duration
			animationFrameId = requestAnimationFrame(animate);
		} else {
			cleanup();
		}
	};
	
	// Cleanup function to ensure resources are properly disposed
	const cleanup = () => {
		// Cancel animation if still running
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		
		// Remove particles and dispose of resources
		if (particleGroup && gameState.scene) {
			// Remove particle group from scene
			gameState.scene.remove(particleGroup);
			
			// Dispose of geometries and materials
			particles.forEach(particle => {
				if (particle.geometry) particle.geometry.dispose();
				if (particle.material) {
					if (Array.isArray(particle.material)) {
						particle.material.forEach(m => m.dispose());
					} else {
						particle.material.dispose();
					}
				}
			});
			
			// Clear arrays
			particles.length = 0;
		}
		
		// Ensure we transition to chess phase
		if (gameState.turnPhase !== 'chess') {
			gameState.turnPhase = 'chess';
			updateGameStatusDisplay();
			
			// Force a render update after changing phase
			if (gameState.renderer && gameState.scene && gameState.camera) {
				gameState.renderer.render(gameState.scene, gameState.camera);
			}
			
			// Try to run the renderScene function if available
			if (typeof gameState.renderScene === 'function') {
				gameState.renderScene();
			}
		}
		
		console.log('Explosion animation complete, transitioned to chess phase');
	};
	
	// Start the animation
	animate();
	
	// Create UI explosion effect as well
	const animElement = document.createElement('div');
	animElement.style.position = 'fixed';
	animElement.style.top = '50%';
	animElement.style.left = '50%';
	animElement.style.transform = 'translate(-50%, -50%)';
	animElement.style.color = 'red';
	animElement.style.fontSize = '72px';
	animElement.style.fontWeight = 'bold';
	animElement.style.textShadow = '0 0 20px rgba(255,50,0,0.8)';
	animElement.style.zIndex = '1000';
	animElement.style.pointerEvents = 'none';
	animElement.style.opacity = '0';
	animElement.style.transition = 'all 0.5s';
	animElement.textContent = 'INVALID!';

	document.body.appendChild(animElement);

	// Animation sequence
	setTimeout(() => {
		animElement.style.opacity = '1';
		animElement.style.fontSize = '96px';
	}, 50);

	setTimeout(() => {
		animElement.style.opacity = '0';
	}, 700);

	setTimeout(() => {
		document.body.removeChild(animElement);
	}, 1200);
	
	// Safety cleanup in case animation gets stuck
	setTimeout(() => {
		if (animationFrameId) {
			console.warn('Explosion animation safety cleanup triggered');
			cleanup();
		}
	}, 2000);
}
/**
 * Send tetromino placement to server
 * @param {Object} tetrominoData - Tetromino data to send
 * @returns {Promise} Promise that resolves with the server response
 */
function sendTetrominoPlacementToServer(tetrominoData) {
	console.log('Sending tetromino placement to server:', tetrominoData);
	console.log('Current turnPhase before placement:', gameState.turnPhase);

	// Perform client-side validation first
	const isLocallyValid = validatePlacementLocally(tetrominoData);
	console.log('Local validation result:', isLocallyValid ? 'valid' : 'invalid');
	
	// Clone the data for server submission to avoid modifying the original
	const serverData = JSON.parse(JSON.stringify(tetrominoData));
	
	// Ensure pieceType is set (server expects this)
	serverData.pieceType = tetrominoData.type;
	
	// Ensure coordinates are sent properly - these should be relative board positions
	// Server expects x, z coordinates without board offset adjustments
	if (serverData.position) {
		// Ensure we're sending plain coordinates, not objects
		serverData.x = serverData.position.x;
		serverData.z = serverData.position.z;
		serverData.y = serverData.heightAboveBoard || 0;
		
		// Log for debugging
		console.log(`Sending coordinates to server: (${serverData.x}, ${serverData.z}, ${serverData.y})`);
	}
	
	// Add gameId to the request
	const gameId = NetworkManager.getGameId();
	if (gameId) {
		serverData.gameId = gameId;
	}

	// Function to handle connection issues with retry logic
	const ensureConnectedAndSend = async () => {
		// Check if connected
		if (!NetworkManager.isConnected()) {
			console.log('Not connected to server. Attempting to reconnect...');
		
			// Show reconnection message
			if (typeof showToastMessage === 'function') {
				showToastMessage('Connection lost. Attempting to reconnect...');
			}
		
			// Try to reconnect with improved backoff strategy (5 attempts)
			const connected = await NetworkManager.ensureConnected(null, 5);
			
			if (!connected) {
				console.error('Failed to reconnect after multiple attempts');
				return { 
					success: false, 
					reason: 'network_error',
					message: 'Unable to connect to server after multiple attempts. Please refresh the page.'
				};
			}
			
			// If we need to rejoin the game
			if (!NetworkManager.getGameId()) {
				console.log('No gameId after reconnection, attempting to join a game');
				try {
					const gameData = await NetworkManager.joinGame();
					console.log('Rejoined game:', gameData);
					
					// Update gameId if needed
					if (gameData && gameData.gameId && typeof NetworkManager.updateGameId === 'function') {
						NetworkManager.updateGameId(gameData.gameId);
						serverData.gameId = gameData.gameId;
					}
				} catch (error) {
					console.error('Failed to rejoin game after reconnection:', error);
						return { 
							success: false, 
							reason: 'network_error',
							message: 'Failed to rejoin game after reconnection'
						};
					}
			}
		}
		
		// At this point we should be connected, submit the placement
		console.log('Current turnPhase before server submission:', gameState.turnPhase);
		try {
			return await NetworkManager.submitTetrominoPlacement(serverData);
		} catch (error) {
			console.error('Error submitting tetromino placement:', error);
			
			// Identify error type
			const isNetworkError = error.message?.includes('connect') || 
								error.message?.includes('network') ||
								error.message?.includes('timeout') ||
								!NetworkManager.isConnected();
			
			// For network errors, we could try one more reconnection attempt
			if (isNetworkError) {
				// We already tried to reconnect above, so this is a final failure
					return { 
						success: false, 
						reason: 'network_error',
					message: 'Network error during placement submission'
					};
				}
			
			// Server validation errors
				return { 
					success: false, 
				reason: 'validation_error',
				message: error.message || 'Server rejected placement',
				error: error
			};
		}
	};
	
	// Main execution flow: show local animation immediately, then verify with server
	// This way the game feels responsive
	if (isLocallyValid) {
		// Show "valid" animation immediately based on local validation
		showLocalPlacementEffect(tetrominoData);
	} else {
		// Show "invalid" animation immediately based on local validation  
		showLocalExplosionEffect(tetrominoData);
	}
	
	// Return a promise that resolves when server validation completes
	return ensureConnectedAndSend().then(response => {
		console.log('Server response for tetromino placement:', response);
		console.log('Current turnPhase after server response:', gameState.turnPhase);
		
		// Check if server disagrees with our local validation
		const serverAccepted = response && response.success;
		
		if (serverAccepted !== isLocallyValid) {
			console.log('Server and local validation disagree! Server says:', serverAccepted ? 'valid' : 'invalid');
			
			// Show the correct animation based on server response
			if (serverAccepted) {
				// We thought invalid, but server says valid
				showCorrectionPlacementEffect(tetrominoData);
			} else {
				// We thought valid, but server says invalid
				showCorrectionExplosionEffect(tetrominoData);
			}
		} else {
			// Server agrees with local validation, but make sure things are cleaned up
			// Update board visuals and game state if needed
			if (typeof window.updateBoardVisuals === 'function') {
				window.updateBoardVisuals();
			}
			
			// Double-check that turnPhase is set correctly
			if (gameState.turnPhase !== 'chess') {
				console.warn('turnPhase is not chess after placement! Setting it now.');
				gameState.turnPhase = 'chess';
				if (typeof window.updateGameStatusDisplay === 'function') {
					window.updateGameStatusDisplay();
				}
			}
		}
		
		return response;
	});
}

/**
 * Validates tetromino placement locally before sending to server
 * @param {Object} tetrominoData - The tetromino data
 * @returns {boolean} - Whether the placement is valid
 */
function validatePlacementLocally(tetrominoData) {
	console.log('Validating tetromino placement locally', tetrominoData);

	// Check if we have the required data
	if (!tetrominoData || !gameState || !gameState.board) {
		console.error('Missing required data for local validation');
		return false;
	}

	const { shape, position } = tetrominoData;
	const { x: posX, z: posZ } = position;

	// First check for collision with existing cells or boundaries
	const hasCollision = checkTetrominoCollision(gameState, shape, posX, posZ);
	if (hasCollision) {
		console.log('Local validation: Collision detected');
		return false;
	}

	// Check if tetromino is adjacent to existing cells
	const isAdjacent = isTetrominoAdjacentToExistingCells(gameState, shape, posX, posZ);
	if (!isAdjacent) {
		console.log('Local validation: Not adjacent to existing cells');
		return false;
	}

	// Check if any cell of the tetromino would have a path to the king
	let hasPath = false;
	
	// First, we'll simulate placing the tetromino on the board to check connectivity
	const simulatedBoard = JSON.parse(JSON.stringify(gameState.board));
	if (!simulatedBoard.cells) simulatedBoard.cells = {};
	
	// Add the tetromino cells to the simulated board
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				const key = `${boardX},${boardZ}`;
				simulatedBoard.cells[key] = {
					type: 'tetromino',
					player: gameState.currentPlayer
				};
			}
		}
	}
	
	// Now check if any cell has a path to the king
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// Create a temporary gameState for path checking
				const tempGameState = { ...gameState, board: simulatedBoard };
				
				const path = hasPathToKing(tempGameState, boardX, boardZ, gameState.currentPlayer);
				if (path) {
					hasPath = true;
					
					// Store the best path for visualization
					gameState.pendingPath = path;
					break;
				}
			}
		}
		if (hasPath) break;
	}
	
	// If the tetromino would form an island with no path to king, it's invalid
	if (!hasPath) {
		console.log('Local validation: No path to king');
		return false;
	}
	
	console.log('Local validation: Placement is valid');
	return true;
}

/**
 * Show local placement effect immediately after client-side validation
 * @param {Object} tetrominoData - The tetromino data
 */
function showLocalPlacementEffect(tetrominoData) {
	const posX = tetrominoData.position.x;
	const posZ = tetrominoData.position.z;
	
	// Show placement effect
	showPlacementEffect(posX, posZ, gameState);
	
	// Create animation element for "locked" feedback
	const animElement = document.createElement('div');
	animElement.style.position = 'fixed';
	animElement.style.top = '50%';
	animElement.style.left = '50%';
	animElement.style.transform = 'translate(-50%, -50%)';
	animElement.style.color = 'white';
	animElement.style.fontSize = '48px';
	animElement.style.fontWeight = 'bold';
	animElement.style.textShadow = '0 0 10px rgba(0,255,0,0.8)';
	animElement.style.zIndex = '1000';
	animElement.style.pointerEvents = 'none';
	animElement.style.opacity = '0';
	animElement.style.transition = 'all 0.3s';
	animElement.textContent = 'LOCKED!';

	document.body.appendChild(animElement);
	
	// Animation sequence
	setTimeout(() => {
		animElement.style.opacity = '1';
		animElement.style.fontSize = '72px';
	}, 50);

	setTimeout(() => {
		animElement.style.opacity = '0';
	}, 700);

	setTimeout(() => {
		document.body.removeChild(animElement);
	}, 1000);
	
	// Switch to chess phase
	gameState.turnPhase = 'chess';
	
	// Update game status display
	if (typeof window.updateGameStatusDisplay === 'function') {
		window.updateGameStatusDisplay();
	}
	
	// Update the board visuals
	if (typeof window.updateBoardVisuals === 'function') {
		window.updateBoardVisuals();
	}
	
	// Log the phase change
	console.log('Local validation successful - switched to chess phase:', gameState.turnPhase);
}

/**
 * Show local explosion effect immediately after client-side validation
 * @param {Object} tetrominoData - The tetromino data
 */
function showLocalExplosionEffect(tetrominoData) {
	const posX = tetrominoData.position.x;
	const posZ = tetrominoData.position.z;
	
	// Show explosion animation
	showExplosionAnimation(posX, posZ, gameState);
	
	// Switch to chess phase
	gameState.turnPhase = 'chess';
	
	// Update game status display
	if (typeof window.updateGameStatusDisplay === 'function') {
		window.updateGameStatusDisplay();
	}
	
	// Update the board visuals
	if (typeof window.updateBoardVisuals === 'function') {
		window.updateBoardVisuals();
	}
	
	// Log the phase change
	console.log('Local validation failed - switched to chess phase after explosion:', gameState.turnPhase);
}

/**
 * Show correction placement effect when server disagrees with local validation
 * @param {Object} tetrominoData - The tetromino data
 */
function showCorrectionPlacementEffect(tetrominoData) {
	const posX = tetrominoData.position.x;
	const posZ = tetrominoData.position.z;
	
	// Show placement effect
	showPlacementEffect(posX, posZ, gameState);
	
	// Properly remove the current tetromino and ghost piece
	if (gameState.currentTetrominoShapeGroup) {
		if (gameState.tetrominoGroup) {
			gameState.tetrominoGroup.remove(gameState.currentTetrominoShapeGroup);
		}
		gameState.currentTetrominoShapeGroup = null;
	}
	
	// Remove ghost piece if it exists
	if (gameState.ghostTetrominoGroup) {
		if (gameState.tetrominoGroup) {
			gameState.tetrominoGroup.remove(gameState.ghostTetrominoGroup);
		}
		gameState.ghostTetrominoGroup = null;
	}
	
	// Clear the current tetromino
	gameState.currentTetromino = null;
	
	// Show correction message
	const animElement = document.createElement('div');
	animElement.style.position = 'fixed';
	animElement.style.top = '50%';
	animElement.style.left = '50%';
	animElement.style.transform = 'translate(-50%, -50%)';
	animElement.style.color = 'yellow';
	animElement.style.fontSize = '36px';
	animElement.style.fontWeight = 'bold';
	animElement.style.textShadow = '0 0 10px rgba(255,255,0,0.8)';
	animElement.style.zIndex = '1000';
	animElement.style.pointerEvents = 'none';
	animElement.style.opacity = '0';
	animElement.style.transition = 'all 0.3s';
	animElement.textContent = 'SERVER OVERRIDE: VALID!';

	document.body.appendChild(animElement);
	
	// Animation sequence
	setTimeout(() => {
		animElement.style.opacity = '1';
		animElement.style.fontSize = '42px';
	}, 50);

	setTimeout(() => {
		animElement.style.opacity = '0';
	}, 1500);

	setTimeout(() => {
		document.body.removeChild(animElement);
	}, 1800);
	
	// Switch to chess phase
	gameState.turnPhase = 'chess';
	
	// Update game status display
	if (typeof window.updateGameStatusDisplay === 'function') {
		window.updateGameStatusDisplay();
	}
}

/**
 * Show correction explosion effect when server disagrees with local validation
 * @param {Object} tetrominoData - The tetromino data
 */
function showCorrectionExplosionEffect(tetrominoData) {
	const posX = tetrominoData.position.x;
	const posZ = tetrominoData.position.z;
	
	// Show explosion animation
	showExplosionAnimation(posX, posZ, gameState);
	
	// Properly remove the current tetromino and ghost piece
	if (gameState.currentTetrominoShapeGroup) {
		if (gameState.tetrominoGroup) {
			gameState.tetrominoGroup.remove(gameState.currentTetrominoShapeGroup);
		}
		gameState.currentTetrominoShapeGroup = null;
	}
	
	// Remove ghost piece if it exists
	if (gameState.ghostTetrominoGroup) {
		if (gameState.tetrominoGroup) {
				gameState.tetrominoGroup.remove(gameState.ghostTetrominoGroup);
			}
		gameState.ghostTetrominoGroup = null;
	}
	
	// Clear the current tetromino
	gameState.currentTetromino = null;
	
	// Show correction message
	const animElement = document.createElement('div');
	animElement.style.position = 'fixed';
	animElement.style.top = '50%';
	animElement.style.left = '50%';
	animElement.style.transform = 'translate(-50%, -50%)';
	animElement.style.color = 'orange';
	animElement.style.fontSize = '36px';
	animElement.style.fontWeight = 'bold';
	animElement.style.textShadow = '0 0 10px rgba(255,165,0,0.8)';
	animElement.style.zIndex = '1000';
	animElement.style.pointerEvents = 'none';
	animElement.style.opacity = '0';
	animElement.style.transition = 'all 0.3s';
	animElement.textContent = 'SERVER OVERRIDE: INVALID!';

	document.body.appendChild(animElement);
	
	// Animation sequence
	setTimeout(() => {
		animElement.style.opacity = '1';
		animElement.style.fontSize = '42px';
	}, 50);

	setTimeout(() => {
		animElement.style.opacity = '0';
	}, 1500);

	setTimeout(() => {
		document.body.removeChild(animElement);
	}, 1800);
	
	// Switch to chess phase
	gameState.turnPhase = 'chess';
	
	// Update game status display
	if (typeof window.updateGameStatusDisplay === 'function') {
		window.updateGameStatusDisplay();
	}
}

/**
 * Show an effect when a tetromino is placed
 * @param {number} x - X position on the board 
 * @param {number} z - Z position on the board
 * @param {Object} gameState - The current game state
 */
export function showPlacementEffect(x, z, gameState) {
	const THREE = getTHREE();
	
	// Determine which scene to use - fall back to global scene if gameState.scene is undefined
	let targetScene;
	if (gameState && gameState.scene) {
		targetScene = gameState.scene;
	} else if (typeof scene !== 'undefined') {
		// Fall back to global scene if available
		targetScene = scene;
		console.log('Using global scene for placement effect');
	} else {
		// If no scene is available, log and return
		console.warn('No scene available for placement effect');
		return;
	}
	
	// Adjust the effect position to be relative to the board centre
	const effectX = x; // These are board coordinates already
	const effectZ = z;
	
	console.log(`Placement effect at board position (${effectX}, ${effectZ})`);
	
	// Create simple particles at the placement location
	const particleCount = 20;
	const particleGroup = new THREE.Group();
	particleGroup.position.set(0, 0, 0); // Position at origin
	targetScene.add(particleGroup);

	// Create particles
	for (let i = 0; i < particleCount; i++) {
		const size = Math.random() * 0.2 + 0.1;
		const geometry = new THREE.BoxGeometry(size, size, size);
		const material = new THREE.MeshBasicMaterial({
			color: 0xFFFFFF,
			transparent: true,
			opacity: 0.8
		});

		const particle = new THREE.Mesh(geometry, material);
		
		// Position particle relative to the board coordinates
		particle.position.set(
			effectX + Math.random() * 1.5 - 0.75, // Reduced spread
			0.5,
			effectZ + Math.random() * 1.5 - 0.75  // Reduced spread
		);

		// Add velocity
		particle.userData.velocity = {
			x: (Math.random() - 0.5) * 0.15,
			y: Math.random() * 0.3 + 0.1,
			z: (Math.random() - 0.5) * 0.15
		};

		particleGroup.add(particle);
	}

	// Animate particles
	let lifetime = 0;
	const animate = () => {
		lifetime += 1;

		// Update particles
		particleGroup.children.forEach(particle => {
			particle.position.x += particle.userData.velocity.x;
			particle.position.y += particle.userData.velocity.y;
			particle.position.z += particle.userData.velocity.z;

			// Apply gravity
			particle.userData.velocity.y -= 0.01;

			// Fade out
			if (particle.material) {
				particle.material.opacity = Math.max(0, 0.8 - (lifetime / 20));
			}
		});

		// Continue animation if not done
		if (lifetime < 20) {
			requestAnimationFrame(animate);
		} else {
			// Remove particles safely
			try {
				targetScene.remove(particleGroup);
				
				// Dispose of resources
				particleGroup.children.forEach(particle => {
					if (particle.geometry) particle.geometry.dispose();
					if (particle.material) particle.material.dispose();
				});
			} catch (e) {
				console.warn('Error removing particle group:', e);
			}
		}
	};

	// Start animation
	animate();
}
/**
 * Create a tetromino block at the specified position
 * @param {number} x - X coordinate (relative to board coordinates)
 * @param {number} z - Z coordinate (relative to board coordinates)
 * @param {string|number} playerType - The player type or tetromino shape letter
 * @param {boolean} isGhost - Whether this is a ghost block
 * @param {number} heightAboveBoard - Height above the board (y position)
 * @param {Object} gameState - Optional game state for centre-relative positioning
 * @returns {THREE.Object3D} The created tetromino block
 */
export function createTetrominoBlock(x, z, playerType, isGhost = false, heightAboveBoard = 0, gameState = null) {
	const THREE = getTHREE();
	// Get a mesh from object pool
	const block = objectPool.getTetrominoBlock();
	
	// Determine the real coordinates of the block on the board
	const absPos = translatePosition({x, z}, gameState, true);
	let absoluteX = absPos.x;
	let absoluteZ = absPos.z;
	
	
	// Get material color based on player type
	let color = 0xcccccc; // Default gray
	
	// Try to use the centralized player color function first
	if (boardFunctions && boardFunctions.getPlayerColor) {
		try {
			// Get the game state to check for current player
			const stateForColors = gameState || {};
			
			// Use true for forTetromino flag to ensure tetromino specific coloring
			color = boardFunctions.getPlayerColor(playerType, stateForColors, true);
		} catch (err) {
			console.warn('Error using centralized color function, falling back to defaults:', err);
		}
	}
	
	// Fallback to traditional coloring if needed
	if (color === 0xcccccc) {
		// Map player type to color
		if (typeof playerType === 'number') {
			// Use player colors by index
			color = PLAYER_COLORS[playerType] || 0xcccccc;
		} else if (typeof playerType === 'string') {
			// Map tetromino shape letters to colors
			switch (playerType) {
				case 'I': color = 0x00ffff; break; // Cyan
				case 'J': color = 0x0000ff; break; // Blue
				case 'L': color = 0xff8000; break; // Orange
				case 'O': color = 0xffff00; break; // Yellow
				case 'S': color = 0x00ff00; break; // Green
				case 'T': color = 0x800080; break; // Purple
				case 'Z': color = 0xff0000; break; // Red
				default: color = 0x888888; break; // Gray for unknown types
			}
		}
	}

	// Update material properties
	if (block.material) {
		block.material.color.setHex(color);
		block.material.transparent = isGhost;
		block.material.opacity = isGhost ? 0.3 : 1.0;
		block.material.wireframe = isGhost;
		block.material.emissive = isGhost ? { r: 0, g: 0, b: 0 } : block.material.color;
		block.material.emissiveIntensity = isGhost ? 0 : 0.2;
		block.material.needsUpdate = true;
	}

	// Position block - Y is actually height in this coordinate system
	const heightPos = isGhost ? 0.1 : (0.6 + heightAboveBoard);
	block.position.set(0, heightPos, 0); // Reset position to be relative to group

	block.castShadow = !isGhost;
	block.receiveShadow = !isGhost;

	// Store type info and position for identification
	block.userData = {
		type: isGhost ? 'ghostBlock' : 'tetrominoBlock',
		playerType: playerType,
		position: { x, z },
		heightAboveBoard: heightAboveBoard,
		pooledObject: true // Mark as pooled for proper disposal
	};

	// Create a wrapper group to hold the block
	const blockGroup = new THREE.Group();
	blockGroup.add(block);
	
	// Position the group itself at the specified coordinates
	blockGroup.position.set(absoluteX, 0, absoluteZ);

	// Add dispose method to properly return to pool
	blockGroup.dispose = function () {
		// Return the mesh to the pool
		if (this.children.length > 0) {
			const mesh = this.children[0];
			objectPool.returnTetrominoBlock(mesh);
			this.remove(mesh);
		}
	};

	// Store reference to the pooled block and position info
	blockGroup.userData = {
		type: isGhost ? 'ghostBlock' : 'tetrominoBlock',
		playerType: playerType,
		position: { x, z },
		heightAboveBoard: heightAboveBoard,
		pooledMesh: block
	};

	return blockGroup;
}

/**
 * Determines the initial position for a tetromino based on the player's king position
 * @param {Object} gameState - The current game state
 * @returns {Object} Initial position {x, z, heightAboveBoard} for the tetromino
 */
export function determineInitialTetrominoPosition(gameState) {

	
	// Find the current player's king using boardFunctions helper
	const currentPlayer = gameState.currentPlayer;
	const kingPiece = boardFunctions.getPlayersKing(gameState, currentPlayer, false);
	
	
	let kingPosition = null;
	let kingOrientation = 0; // Default orientation (facing up)
	
	// If we found the king using the helper function
	if (kingPiece) {
		kingPosition = { x: kingPiece.position.x, z: kingPiece.position.z };
		kingOrientation = kingPiece.orientation !== undefined ? kingPiece.orientation : 0;
	} else {
		console.log('Tetromino: No king found for player ' + currentPlayer + ', No king, no tetromino', gameState);
		return null;
	}
	
	
	console.log(`Tetromino: Found king`, kingPosition, kingOrientation, kingPiece);
	
	// Translate orientation to direction vector
	let kingDirection;
	switch (kingOrientation) {
		case 0: // Facing up
			kingDirection = { x: 0, z: -1 };
			break;
		case 1: // Facing right
			kingDirection = { x: -1, z: 0 };
			break;
		case 2: // Facing down
			kingDirection = { x: 0, z: 1 };
			break;
		case 3: // Facing left
			kingDirection = { x: 1, z: 0 };
			break;
		default:
			kingDirection = { x: 0, z: -1 }; // Default to facing up
	}
	
	// Create right vector (perpendicular to king direction)
	const rightVector = {
		x: -kingDirection.z, // Perpendicular to forward direction
		z: kingDirection.x
	};
	
	// Random offset between -6 and 6 in the right direction
	const randomOffset = Math.floor(Math.random() * 13) - 6;
	
	// Apply random offset left/right from king position
	let initialX = kingPosition.x + (rightVector.x * randomOffset);
	let initialZ = kingPosition.z + (rightVector.z * randomOffset);
	
	// Calculate how far forward we need to go to avoid collisions
	let forwardDistance = 2; // Start with a minimum distance
	let collisionFree = false;

	console.log('Initial tetromino position', initialX, initialZ);
	
	// Keep moving forward until we find a collision-free initial position
	while (!collisionFree && forwardDistance < 20) { // Limit to prevent infinite loops
		const testX = initialX + (kingDirection.x * forwardDistance);
		const testZ = initialZ + (kingDirection.z * forwardDistance);
		
		// Round to nearest integers for board positions
		const posX = Math.round(testX);
		const posZ = Math.round(testZ);
		
		// Create a test position
		const testPos = { x: posX, z: posZ };
		
		// Check if there are any collisions in the path
		if (gameState.currentTetromino && 
			gameState.currentTetromino.shape && 
			isValidTetrominoPosition(gameState, gameState.currentTetromino.shape, testPos)) {
			collisionFree = true;
			initialX = posX;
			initialZ = posZ;
		} else {
			forwardDistance += 1;
		}
	}
	
	console.log(`Initial tetromino position, collision free: (${initialX}, ${initialZ})`);
	
	// Return the initial position with a height above board
	return {
		x: initialX,
		z: initialZ,
		heightAboveBoard: 10 // Start high above the board
	};
}

/**
 * Initialize a new tetromino with proper positioning based on the king
 * @param {Object} gameState - The current game state
 * @param {string} type - The tetromino type (I, J, L, O, S, T, Z)
 * @returns {Object} The initialized tetromino
 */
export function initializeNewTetromino(gameState, type) {
	// Get the initial position based on king
	const initialPosition = determineInitialTetrominoPosition(gameState);
	
	console.log('Initial tetromino position', initialPosition);

	if(!initialPosition) {
		console.log('Tetromino: No initial position found, returning null');
		return null;
	}

	// Determine shape based on type
	let shape;
	switch (type) {
		case 'I':
			shape = [
				[0, 0, 0, 0],
				[1, 1, 1, 1],
				[0, 0, 0, 0],
				[0, 0, 0, 0]
			];
			break;
		case 'J':
			shape = [
				[1, 0, 0],
				[1, 1, 1],
				[0, 0, 0]
			];
			break;
		case 'L':
			shape = [
				[0, 0, 1],
				[1, 1, 1],
				[0, 0, 0]
			];
			break;
		case 'O':
			shape = [
				[1, 1],
				[1, 1]
			];
			break;
		case 'S':
			shape = [
				[0, 1, 1],
				[1, 1, 0],
				[0, 0, 0]
			];
			break;
		case 'T':
			shape = [
				[0, 1, 0],
				[1, 1, 1],
				[0, 0, 0]
			];
			break;
		case 'Z':
			shape = [
				[1, 1, 0],
				[0, 1, 1],
				[0, 0, 0]
			];
			break;
		default:
			shape = [
				[1, 1],
				[1, 1]
			];
	}
	
	// Create the tetromino object
	return {
		type: type,
		shape: shape,
		position: {
			x: initialPosition.x,
			z: initialPosition.z
		},
		heightAboveBoard: initialPosition.heightAboveBoard
	};
}

/**
 * Enhanced tetromino rendering function with board centre awareness
 * @param {Object} gameState - The current game state
 * @returns {boolean} - Whether the render was successful
 */
export function renderTetromino(gameState) {
	if (!gameState || !gameState.currentTetromino || !gameState.tetrominoGroup) {
		console.warn('Cannot render tetromino: missing required objects', gameState);
		return false;
	}
	
	try {
		// Clear existing tetromino visualization including any ghost pieces
		while (gameState.tetrominoGroup.children.length > 0) {
			const child = gameState.tetrominoGroup.children[0];
			
			// Release resources if needed
			if (child.dispose) child.dispose();
			
			// Remove from group
			gameState.tetrominoGroup.remove(child);
		}
		
		// Clear ghost piece reference
		if (gameState.ghostPieceGroup) {
			gameState.ghostPieceGroup = null;
		}
		
		const tetromino = gameState.currentTetromino;
		const shape = tetromino.shape;
		const heightAboveBoard = tetromino.heightAboveBoard || 0;
		
		// Log current state for debugging
		console.log(`Rendering tetromino at board position (${tetromino.position.x}, ${tetromino.position.z}), height: ${heightAboveBoard}`);
		
		// Get absolute world position for the tetromino origin
		// All operations use relative coordinates but render with absolute
		const absPos = translatePosition(tetromino.position, gameState, true);
		console.log(`Translated to absolute position: (${absPos.x}, ${absPos.z})`);
		
		// Create a single THREE.Group for the entire tetromino shape
		const THREE = getTHREE();
		const shapeGroup = new THREE.Group();
		
		// Position the shape group at the absolute position
		shapeGroup.position.set(absPos.x, heightAboveBoard, absPos.z);
		
		// Get material color based on tetromino type
		let color = 0xcccccc; // Default gray
		
		// Try to use the centralized player color function first
		if (boardFunctions && boardFunctions.getPlayerColor) {
			try {
				color = boardFunctions.getPlayerColor(tetromino.type, gameState, true);
			} catch (err) {
				console.warn('Error using centralized color function, falling back to defaults:', err);
			}
		}
		
		// Fallback to traditional coloring if needed
		if (color === 0xcccccc) {
			// Map tetromino shape letters to colors
			switch (tetromino.type) {
				case 'I': color = 0x00ffff; break; // Cyan
				case 'J': color = 0x0000ff; break; // Blue
				case 'L': color = 0xff8000; break; // Orange
				case 'O': color = 0xffff00; break; // Yellow
				case 'S': color = 0x00ff00; break; // Green
				case 'T': color = 0x800080; break; // Purple
				case 'Z': color = 0xff0000; break; // Red
				default: color = 0x888888; break; // Gray for unknown types
			}
		}
		
		// Create blocks for each cell of the tetromino
		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (shape[z][x] === 1) {
					// Get block from object pool
					const block = objectPool.getTetrominoBlock();
					
					// Update material properties
					if (block.material) {
						block.material.color.setHex(color);
						block.material.transparent = false;
						block.material.opacity = 1.0;
						block.material.wireframe = false;
						block.material.emissive = block.material.color;
						block.material.emissiveIntensity = 0.2;
						block.material.needsUpdate = true;
					}
					
					// Position each block RELATIVE to the shape group origin
					// This is the key change - blocks are positioned relative to the shape
					block.position.set(x, 0, z);
					
					// Apply other properties
					block.castShadow = true;
					block.receiveShadow = true;
					
					// Store user data for identification
					block.userData = {
						type: 'tetrominoBlock',
						playerType: tetromino.type,
						relativePosition: { x, z },
						position: { x, z },
						heightAboveBoard: heightAboveBoard,
						pooledObject: true
					};
					
					// Add block to the shape group
					shapeGroup.add(block);
				}
			}
		}
		
		// Add the entire shape group to the tetromino group
		gameState.tetrominoGroup.add(shapeGroup);
		
		// Store the shape group reference for easy access
		gameState.currentTetrominoShapeGroup = shapeGroup;
		
		// If we should show ghost piece and tetromino is above board
		if (gameState.showTetrisGhost && heightAboveBoard > 0) {
			renderGhostPiece(gameState, tetromino);
		}
		
		// Force a scene update if renderer and camera are available
		if (window.renderer && window.scene && window.camera) {
			window.renderer.render(window.scene, window.camera);
		}
		
		return true;
	} catch (error) {
		console.error('Error rendering tetromino:', error);
		return false;
	}
}

/**
 * Renders a ghost piece showing where the tetromino would land
 * @param {Object} gameState - The current game state
 * @param {Object} tetromino - The current tetromino
 */
function renderGhostPiece(gameState, tetromino) {
	// Clone the current tetromino position
	const ghostPos = {
		x: tetromino.position.x,
		y: 0, // Set ghost position to bottom of the board
		z: tetromino.position.z
	};
	
	// Get the height of the current tetromino
	const currentHeight = tetromino.position.y || tetromino.heightAboveBoard || 0;
	
	// Only show ghost if current piece is above the board
	if (currentHeight > 0) {
		console.log('Rendering ghost piece for tetromino at height:', currentHeight);
		
		// Get absolute world position for the ghost tetromino origin
		const absPos = translatePosition(ghostPos, gameState, true);
		
		// Create a shape group for the ghost
		const THREE = getTHREE();
		const ghostGroup = new THREE.Group();
		
		// Position the ghost group at the absolute position with slight Y offset
		ghostGroup.position.set(absPos.x, 0.1, absPos.z); // Small Y offset for ghost
		
		// Get material color based on tetromino type
		let color = 0xcccccc; // Default gray
		if (boardFunctions && boardFunctions.getPlayerColor) {
			try {
				color = boardFunctions.getPlayerColor(tetromino.type, gameState, true);
			} catch (err) {
				console.warn('Error using centralized color function for ghost:', err);
			}
		}
		
		// Fallback
		if (color === 0xcccccc) {
			// Map tetromino shape letters to colors
			switch (tetromino.type) {
				case 'I': color = 0x00ffff; break; // Cyan
				case 'J': color = 0x0000ff; break; // Blue
				case 'L': color = 0xff8000; break; // Orange
				case 'O': color = 0xffff00; break; // Yellow
				case 'S': color = 0x00ff00; break; // Green
				case 'T': color = 0x800080; break; // Purple
				case 'Z': color = 0xff0000; break; // Red
				default: color = 0x888888; break; // Gray
			}
		}
		
		// Create ghost blocks
		for (let z = 0; z < tetromino.shape.length; z++) {
			for (let x = 0; x < tetromino.shape[z].length; x++) {
				if (tetromino.shape[z][x] === 1) {
					// Get block from object pool
					const block = objectPool.getTetrominoBlock();
					
					// Set ghost material properties
					if (block.material) {
						block.material.color.setHex(color);
						block.material.transparent = true;
						block.material.opacity = 0.3;
						block.material.wireframe = true;
						block.material.emissive = new THREE.Color(0, 0, 0); // Fix emissive being an object literal
						block.material.emissiveIntensity = 0;
						block.material.needsUpdate = true;
					}
					
					// Position relative to ghost group
					block.position.set(x, 0, z);
					
					// Disable shadows for ghost
					block.castShadow = false;
					block.receiveShadow = false;
					
					// Store user data
					block.userData = {
						type: 'ghostBlock',
						playerType: tetromino.type,
						relativePosition: { x, z },
						position: { x, z },
						heightAboveBoard: 0,
						pooledObject: true
					};
					
					// Add to ghost group
					ghostGroup.add(block);
				}
			}
		}
		
		// Add ghost group to tetromino group
		gameState.tetrominoGroup.add(ghostGroup);
		
		// Store reference to ghost group for easy cleanup
		gameState.ghostPieceGroup = ghostGroup;
	}
}

export function createTetrominoMesh(tetrominoData, gameState) {
	const THREE = getTHREE();
	const geometry = new THREE.BoxGeometry(1, 1, 1);
	const material = new THREE.MeshBasicMaterial({ color: tetrominoData.color || 0x000000 });
	const mesh = new THREE.Mesh(geometry, material);
	return mesh;
}

/**
 * Updated functions for working with the sparse board structure
 * These functions accept parameters rather than relying on global variables
 */
/**
 * Check if a tetromino position is valid (no collisions)
 * @param {Object} gameState - The current game state
 * @param {Array} shape - 2D array representing tetromino shape
 * @param {Object} position - Position {x, z}
 * @returns {boolean} - Whether the position is valid
 */
function isValidTetrominoPosition(gameState, shape, position) {
	// Check each block of the tetromino
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				// Calculate block position
				const blockX = position.x + x;
				const blockZ = position.z + z;

				// Check for collision with existing board content using sparse structure
				if (gameState.board && gameState.board.cells) {
					const key = `${blockX},${blockZ}`;
					const cell = gameState.board.cells[key];

					if (cell !== undefined && cell !== null) {
						console.log(`Collision detected at (${blockX}, ${blockZ}) with:`, cell);
						return false;
					}
				}
			}
		}
	}

	return true;
}/**
 * Place the current tetromino on the board
 * @param {Object} gameState - The current game state
 * @param {Function} showPlacementEffect - Function to show placement effect
 * @param {Function} updateGameStatusDisplay - Function to update game status
 * @param {Function} updateBoardVisuals - Function to update board visuals
 */
function placeTetromino(gameState, showPlacementEffect, updateGameStatusDisplay, updateBoardVisuals) {
	if (!gameState.currentTetromino) return;

	const shape = gameState.currentTetromino.shape;
	const posX = gameState.currentTetromino.position.x;
	const posZ = gameState.currentTetromino.position.z;
	const player = gameState.currentPlayer;

	console.log(`Placing tetromino at (${posX}, ${posZ})`);

	// If we don't have a board object yet, create one
	if (!gameState.board) {
		gameState.board = {
			cells: {},
			minX: 0,
			maxX: 32,
			minZ: 0,
			maxZ: 32,
			width: 33,
			height: 33
		};
	}

	// If we don't have a cells object yet, create one
	if (!gameState.board.cells) {
		gameState.board.cells = {};
	}

	// Place each block of the tetromino on the board
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;

				// Set the cell in the sparse structure
				const key = `${boardX},${boardZ}`;
				gameState.board.cells[key] = {
					type: 'tetromino',
					player: player
				};

				// Update board boundaries
				// Log the placement
				console.log(`Placed block at (${boardX}, ${boardZ})`);
			}
		}
	}

	// Display the placed tetromino with a nice effect
	if (typeof showPlacementEffect === 'function') {
		showPlacementEffect(posX, posZ, gameState);
	}

	// Switch to chess phase
	gameState.turnPhase = 'chess';
	if (typeof updateGameStatusDisplay === 'function') {
		updateGameStatusDisplay();
	}

	// Clear the current tetromino
	gameState.currentTetromino = null;

	// Update the board visuals
	if (typeof updateBoardVisuals === 'function') {
		updateBoardVisuals();
	}
}
/**
 * Improved version of isTetrominoAdjacentToExistingCells that better handles edge cases
 * @param {Object} gameState - The current game state
 * @param {Array} shape - 2D array representing tetromino shape
 * @param {number} posX - X position
 * @param {number} posZ - Z position
 * @returns {boolean} - Whether the tetromino is adjacent to existing cells
 */
export function isTetrominoAdjacentToExistingCells(gameState, shape, posX, posZ) {
	// First check if the board is completely empty
	const hasCells = gameState.board &&
		gameState.board.cells &&
		Object.keys(gameState.board.cells).length > 0;

	// If the board is completely empty, allow placement anywhere
	if (!hasCells) {
		console.log('Board is empty, allowing first piece placement');
		return true;
	}

	// For the very first piece on the board, we need to handle the special case
	const occupiedCells = Object.keys(gameState.board.cells || {}).filter(key => {
		const cell = gameState.board.cells[key];
		return cell !== null && cell !== undefined;
	});

	if (occupiedCells.length === 0) {
		console.log('No occupied cells on board, allowing first piece placement');
		return true;
	}

	// For each block in the tetromino, check if it's adjacent to an existing cell
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const blockX = posX + x;
				const blockZ = posZ + z;

				// Check all 8 adjacent positions
				const directions = [
					{ dx: -1, dz: 0 }, // Left
					{ dx: 1, dz: 0 }, // Right
					{ dx: 0, dz: -1 }, // Up
					{ dx: 0, dz: 1 }, // Down
					{ dx: -1, dz: -1 }, // Top-left
					{ dx: 1, dz: -1 }, // Top-right
					{ dx: -1, dz: 1 }, // Bottom-left
					{ dx: 1, dz: 1 } // Bottom-right
				];

				for (const dir of directions) {
					const adjX = blockX + dir.dx;
					const adjZ = blockZ + dir.dz;
					const key = `${adjX},${adjZ}`;

					// Check if the adjacent cell contains a block
					if (gameState.board && gameState.board.cells &&
						gameState.board.cells[key] !== undefined &&
						gameState.board.cells[key] !== null) {
						console.log(`Found adjacent cell at (${adjX}, ${adjZ})`);
						return true;
					}
				}
			}
		}
	}

	// Debug logging
	console.log('No adjacent existing cells found for tetromino at position:', { posX, posZ });

	// No adjacent existing cells found
	return false;
}
/**
 * Check collision between tetromino and board or boundary
 * @param {Object} gameState - The current game state
 * @param {Array} shape - Tetromino shape
 * @param {number} posX - X position
 * @param {number} posZ - Z position
 * @returns {boolean} - Whether there is a collision
 */
function checkTetrominoCollision(gameState, shape, posX, posZ) {
	// For each block in the tetromino
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;

				// Check board boundaries
				const minX = gameState.boardBounds?.minX || 0;
				const maxX = gameState.boardBounds?.maxX || 32;
				const minZ = gameState.boardBounds?.minZ || 0;
				const maxZ = gameState.boardBounds?.maxZ || 32;

				if (boardX < minX || boardX > maxX || boardZ < minZ || boardZ > maxZ) {
					return true; // Out of bounds
				}

				// Check if the position is already occupied
				const key = `${boardX},${boardZ}`;
				if (gameState.board && gameState.board.cells &&
					gameState.board.cells[key] !== undefined &&
					gameState.board.cells[key] !== null) {
					return true; // Collision
				}
			}
		}
	}

	return false; // No collision
}

/**
 * Creates a standard 7-bag of tetrominos with proper shuffling
 * @returns {Array} Array of tetromino types (I, J, L, O, S, T, Z)
 */
function createShuffledTetrominoBag() {
	// Create a standard set of 7 tetrominos
	const tetrominoTypes = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
	
	// Shuffle using Fisher-Yates algorithm for proper randomization
	for (let i = tetrominoTypes.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[tetrominoTypes[i], tetrominoTypes[j]] = [tetrominoTypes[j], tetrominoTypes[i]];
	}
	
	return tetrominoTypes;
}

/**
 * Manages the tetromino bag and initializes the next tetromino
 * @param {Object} gameState - The current game state
 * @returns {Object} The initialized tetromino
 */
export function initializeNextTetromino(gameState) {
	// Initialize tetrominoBag in gameState if it doesn't exist
	if (!gameState.tetrominoBag || !Array.isArray(gameState.tetrominoBag) || gameState.tetrominoBag.length === 0) {
		console.log('Creating new shuffled tetromino bag');
		gameState.tetrominoBag = createShuffledTetrominoBag();
	}
	
	// Initialize nextTetromino in gameState if it doesn't exist
	if (!gameState.nextTetromino) {
		console.log('Setting initial next tetromino');
		gameState.nextTetromino = gameState.tetrominoBag.shift();
		
		// If bag is empty after taking next piece, refill it
		if (gameState.tetrominoBag.length === 0) {
			gameState.tetrominoBag = createShuffledTetrominoBag();
		}
	}
	
	// Get the type of the next tetromino
	const nextType = gameState.nextTetromino;
	
	// Take the next piece from the bag and make it the new nextTetromino
	gameState.nextTetromino = gameState.tetrominoBag.shift();
	
	// If the bag is empty after taking the next piece, refill it
	if (gameState.tetrominoBag.length === 0) {
		gameState.tetrominoBag = createShuffledTetrominoBag();
	}
	
	// Update UI display of next tetromino
	updateNextTetrominoDisplay(gameState.nextTetromino, gameState);
	
	console.log(`Initializing new tetromino of type ${nextType}. Next tetromino will be ${gameState.nextTetromino}`);
	
	// Initialize and return the new tetromino using the existing function
	return initializeNewTetromino(gameState, nextType);
}

/**
 * Updates the UI display to show the next tetromino
 * @param {string} tetrominoType - The type of the next tetromino (I, J, L, O, S, T, Z)
 * @param {Object} gameState - The current game state
 */
export function updateNextTetrominoDisplay(tetrominoType, gameState) {
	// Get or create the next tetromino display element
	let nextTetrominoDisplay = document.getElementById('next-tetromino-display');
	
	// If the display element doesn't exist, create it
	if (!nextTetrominoDisplay) {
		console.log('Creating next tetromino display element');
		nextTetrominoDisplay = document.createElement('div');
		nextTetrominoDisplay.id = 'next-tetromino-display';
		nextTetrominoDisplay.style.position = 'fixed';
		nextTetrominoDisplay.style.top = '20px';
		nextTetrominoDisplay.style.right = '20px';
		nextTetrominoDisplay.style.zIndex = '1000';
		nextTetrominoDisplay.style.background = 'rgba(0, 0, 0, 0.7)';
		nextTetrominoDisplay.style.padding = '10px';
		nextTetrominoDisplay.style.borderRadius = '5px';
		nextTetrominoDisplay.style.fontFamily = 'Arial, sans-serif';
		nextTetrominoDisplay.style.color = 'white';
		nextTetrominoDisplay.style.userSelect = 'none';
		
		// Important: Enable pointer events for the clickable box
		nextTetrominoDisplay.style.pointerEvents = 'auto';
		// Add cursor style to indicate it's clickable
		nextTetrominoDisplay.style.cursor = 'pointer';
		
		// Add a title
		const title = document.createElement('div');
		title.textContent = 'NEXT PIECE';
		title.style.textAlign = 'center';
		title.style.marginBottom = '5px';
		title.style.fontWeight = 'bold';
		nextTetrominoDisplay.appendChild(title);
		
		// Create canvas for tetromino preview
		const canvas = document.createElement('canvas');
		canvas.id = 'next-tetromino-canvas';
		canvas.width = 80;
		canvas.height = 80;
		nextTetrominoDisplay.appendChild(canvas);
		
		// Add a hint for clicking
		const hintText = document.createElement('div');
		hintText.id = 'next-piece-hint';
		hintText.textContent = 'Click to play';
		hintText.style.textAlign = 'center';
		hintText.style.fontSize = '10px';
		hintText.style.marginTop = '5px';
		hintText.style.opacity = '0.7';
		nextTetrominoDisplay.appendChild(hintText);
		
		// Add click handler for the whole display box
		nextTetrominoDisplay.addEventListener('click', handleNextPieceClick);
		nextTetrominoDisplay.addEventListener('mouseenter', () => {
			nextTetrominoDisplay.style.boxShadow = '0 0 10px rgba(255, 255, 255, 0.5)';
		});
		nextTetrominoDisplay.addEventListener('mouseleave', () => {
			nextTetrominoDisplay.style.boxShadow = 'none';
		});
		
		document.body.appendChild(nextTetrominoDisplay);
	} else {
		// Update the hint text based on the current game phase
		updateNextPieceHint(gameState);
	}
	
	// Store gameState reference on the DOM element for the click handler to access
	if (nextTetrominoDisplay && gameState) {
		nextTetrominoDisplay.gameState = gameState;
	}
	
	// Get the tetromino shape
	let shape;
	switch (tetrominoType) {
		case 'I':
			shape = [
				[0, 0, 0, 0],
				[1, 1, 1, 1],
				[0, 0, 0, 0],
				[0, 0, 0, 0]
			];
			break;
		case 'J':
			shape = [
				[1, 0, 0],
				[1, 1, 1],
				[0, 0, 0]
			];
			break;
		case 'L':
			shape = [
				[0, 0, 1],
				[1, 1, 1],
				[0, 0, 0]
			];
			break;
		case 'O':
			shape = [
				[1, 1],
				[1, 1]
			];
			break;
		case 'S':
			shape = [
				[0, 1, 1],
				[1, 1, 0],
				[0, 0, 0]
			];
			break;
		case 'T':
			shape = [
				[0, 1, 0],
				[1, 1, 1],
				[0, 0, 0]
			];
			break;
		case 'Z':
			shape = [
				[1, 1, 0],
				[0, 1, 1],
				[0, 0, 0]
			];
			break;
		default:
			shape = [
				[1, 1],
				[1, 1]
			];
	}
	
	// Get color for the tetromino type
	let color;
	switch (tetrominoType) {
		case 'I': color = '#00FFFF'; break; // Cyan
		case 'J': color = '#0000FF'; break; // Blue
		case 'L': color = '#FF8000'; break; // Orange
		case 'O': color = '#FFFF00'; break; // Yellow
		case 'S': color = '#00FF00'; break; // Green
		case 'T': color = '#800080'; break; // Purple
		case 'Z': color = '#FF0000'; break; // Red
		default: color = '#888888'; break;  // Gray
	}
	
	// Draw the tetromino on the canvas
	const canvas = document.getElementById('next-tetromino-canvas');
	if (canvas) {
		const ctx = canvas.getContext('2d');
		const blockSize = 15;
		
		// Clear canvas completely before drawing new piece
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		
		// Center the tetromino
		const offsetX = (canvas.width - shape[0].length * blockSize) / 2;
		const offsetY = (canvas.height - shape.length * blockSize) / 2;
		
		// Draw each block of the tetromino
		ctx.fillStyle = color;
		ctx.strokeStyle = '#FFFFFF';
		ctx.lineWidth = 1;
		
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x] === 1) {
					const blockX = offsetX + x * blockSize;
					const blockY = offsetY + y * blockSize;
					
					// Fill block
					ctx.fillRect(blockX, blockY, blockSize, blockSize);
					
					// Draw outline
					ctx.strokeRect(blockX, blockY, blockSize, blockSize);
					
					// Draw highlight
					ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
					ctx.fillRect(blockX, blockY, blockSize, blockSize / 3);
					ctx.fillStyle = color;
				}
			}
		}
	}
}

/**
 * Updates the hint text for the next piece preview based on current game phase
 * @param {Object} gameState - The current game state
 */
function updateNextPieceHint(gameState) {
	const hintElement = document.getElementById('next-piece-hint');
	if (!hintElement) return;
	
	if (gameState.turnPhase === 'chess') {
		hintElement.textContent = 'Click to start tetris turn';
		hintElement.style.color = '#4CAF50'; // Green
		hintElement.style.opacity = '1';
	} else {
		hintElement.textContent = 'Playing tetris turn...';
		hintElement.style.color = '#FFA500'; // Orange 
		hintElement.style.opacity = '0.7';
	}
	const nextTetrominoDisplay = document.getElementById('next-tetromino-display');
	if (nextTetrominoDisplay) {
		nextTetrominoDisplay.removeEventListener('click', handleNextPieceClick);
		nextTetrominoDisplay.addEventListener('click', handleNextPieceClick);
	}

}

/**
 * Handles click on the next piece preview
 * @param {Event} event - The click event
 */
function handleNextPieceClick(event) {
	// Use the imported gameState singleton instead of getting it from event
	// let gameState = event.currentTarget.gameState;
	
	if (!gameState) {
		console.error('No gameState available for next piece click handler');
		return;
	}
	
	// Only proceed if we're in chess phase
	if (gameState.turnPhase !== 'chess') {
		console.log('Already in tetris phase, changing to chess phase', gameState.turnPhase);
		// Add a small shake animation to indicate it's not clickable now
		//alert user to tell them to move their chess piece, with a nice animation
		const alertElement = document.createElement('div');
		alertElement.textContent = 'Move your chess piece first';
		alertElement.style.position = 'fixed';
		alertElement.style.top = '50%';
		alertElement.style.left = '50%';
		alertElement.style.transform = 'translate(-50%, -50%)';
		alertElement.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		alertElement.style.color = 'white';
		alertElement.style.padding = '10px';
		alertElement.style.borderRadius = '5px';
		alertElement.style.zIndex = '1000';
		alertElement.style.fontFamily = 'Arial, sans-serif';
		alertElement.style.fontSize = '20px';
		alertElement.style.animation = 'shake 0.5s ease-in-out';
		alertElement.style.animationIterationCount = 'infinite';
		alertElement.style.animationDuration = '0.5s';
		alertElement.style.animationTimingFunction = 'ease-in-out';
		alertElement.style.animationDelay = '0s';
		alertElement.style.animationDirection = 'alternate';
		document.body.appendChild(alertElement);
		setTimeout(() => {
			alertElement.remove();
		}, 2500);
		gameState.turnPhase = 'chess';
		updateGameStatusDisplay();
		console.log('Changed to chess phase', gameState.turnPhase);
		//update clickHandler on the next piece display
		const nextTetrominoDisplay = document.getElementById('next-tetromino-display');
		if (nextTetrominoDisplay) {
			nextTetrominoDisplay.removeEventListener('click', handleNextPieceClick);
			nextTetrominoDisplay.addEventListener('click', handleNextPieceClick);
		}

		return;
	}
	
	console.log('Next piece clicked, transitioning to tetris phase');
	
	// Play click sound if available
	if (typeof playSound === 'function') {
		try {
			playSound('click');
		} catch (e) {
			console.warn('Could not play click sound', e);
		}
	}
	
	// Provide visual feedback for click
	const nextTetrominoDisplay = document.getElementById('next-tetromino-display');
	if (nextTetrominoDisplay) {
		nextTetrominoDisplay.style.transform = 'scale(0.95)';
		setTimeout(() => {
			nextTetrominoDisplay.style.transform = 'scale(1)';
		}, 100);
	}
	
	// 1. Change turn phase to tetris
	gameState.turnPhase = 'tetris';
	
	// 2. Update game status display if function exists
	updateGameStatusDisplay();
	
	// 3. Update the hint text
	updateNextPieceHint(gameState);
	
	// 4. Initialize the next tetromino from the bag
	gameState.currentTetromino = initializeNextTetromino(gameState);
	
	if(!gameState.currentTetromino) {
		console.log('Tetromino: No current tetromino found, returning');
		return;
	}

	// 5. Render the new tetromino
	renderTetromino(gameState);
	
	// 6. If there's a function to handle turn phase changes, call it
	gameState.handleTurnPhaseChange('tetris');
	
	
	// 7. Force a render update if needed
	if (gameState.renderer && gameState.camera && gameState.scene) {
		gameState.renderer.render(gameState.scene, gameState.camera);
	} else if (typeof gameState.renderScene === 'function') {
		gameState.renderScene();
	}
	
	// Prevent event bubbling
	event.stopPropagation();
}

/**
 * Preload tetromino blocks into the object pool for better performance
 * @param {number} count - Number of blocks to preload (default: 50)
 */
export function preloadTetrominoBlocks(count = 50) {
	// Call the objectPool's preload function
	objectPool.preloadTetrominoBlocks(count);
}


export const tetrominoModule = {
	moveTetrominoX,
	moveTetrominoZ,
	moveTetrominoY,
	moveTetrominoForwardBack,
	rotateTetromino,
	hardDropTetromino,
	enhancedPlaceTetromino,
	showPlacementEffect,
	createTetrominoBlock,
	createTetrominoMesh,
	renderTetromino,
	renderGhostPiece,
	cleanupTetrominoAndTransitionToChess,
	determineInitialTetrominoPosition,
	initializeNewTetromino,
	initializeNextTetromino,
	updateNextTetrominoDisplay,
	preloadTetrominoBlocks,
	updateNextPieceHint,
	handleNextPieceClick,
	showExplosionAnimation,
	isTetrominoAdjacentToExistingCells,
	isValidTetrominoPosition,
	placeTetromino,
	checkTetrominoCollision,
	showDropAnimation,
	sendTetrominoPlacementToServer,
};

/**
 * Movement queue system
 * 
 * This system handles all tetromino movements in an orderly queue to prevent
 * race conditions and ensure proper validation and rendering.
 */

/**
 * Movement operation types
 */
const MOVEMENT_TYPES = {
	MOVE_X: 'moveX',
	MOVE_Z: 'moveZ',
	MOVE_Y: 'moveY',
	ROTATE: 'rotate',
	HARD_DROP: 'hardDrop',
	PLACE: 'place',
	EXPLODE: 'explode', 
	CLEANUP: 'cleanup'
};

/**
 * Add a movement operation to the queue
 * @param {string} type - Type of movement (use MOVEMENT_TYPES constants)
 * @param {Object} params - Parameters for the movement
 */
export function queueTetrominoMovement(type, params = {}) {
	// Don't queue operations if no tetromino exists
	if (!gameState.currentTetromino && type !== MOVEMENT_TYPES.CLEANUP) {
		console.log(`Cannot queue ${type} operation - no tetromino exists`);
		return false;
	}
	
	// Don't queue operations if we're not in tetris phase
	if (gameState.turnPhase !== 'tetris' && type !== MOVEMENT_TYPES.CLEANUP) {
		console.log(`Cannot queue ${type} operation - not in tetris phase`);
		return false;
	}
	
	// Add operation to queue
	gameState.tetrominoMovementQueue.push({
		type,
		params,
		timestamp: Date.now()
	});
	
	console.log(`Queued ${type} operation`, params);
	
	// Start processing the queue if it's not already being processed
	if (!gameState.isProcessingMovementQueue) {
		// Use setTimeout to make it async and avoid blocking
		setTimeout(processTetrominoMovementQueue, 0);
	}
	
	return true;
}

/**
 * Process the tetromino movement queue
 */
function processTetrominoMovementQueue() {
	// Check if we're already processing or queue is empty
	if (gameState.isProcessingMovementQueue || gameState.tetrominoMovementQueue.length === 0) {
		return;
	}
	
	// Set processing flag
	gameState.isProcessingMovementQueue = true;
	
	try {
		// Process all operations in the queue
		while (gameState.tetrominoMovementQueue.length > 0) {
			// Get the next operation
			const operation = gameState.tetrominoMovementQueue.shift();
			
			// Skip if no tetromino exists (except for cleanup operations)
			if (!gameState.currentTetromino && operation.type !== MOVEMENT_TYPES.CLEANUP) {
				console.log(`Skipping ${operation.type} operation - no tetromino exists`);
				continue;
			}
			
			// Skip if we're not in tetris phase (except for cleanup operations)
			if (gameState.turnPhase !== 'tetris' && operation.type !== MOVEMENT_TYPES.CLEANUP) {
				console.log(`Skipping ${operation.type} operation - not in tetris phase`);
				continue;
			}
			
			console.log(`Processing ${operation.type} operation`, operation.params);
			
			// Process the operation
			switch (operation.type) {
				case MOVEMENT_TYPES.MOVE_X:
					processHorizontalMove(true, operation.params.dir);
					break;
					
				case MOVEMENT_TYPES.MOVE_Z:
					processHorizontalMove(false, operation.params.dir);
					break;
					
				case MOVEMENT_TYPES.MOVE_Y:
					processVerticalMove(operation.params.height, operation.params.isRelative);
					break;
					
				case MOVEMENT_TYPES.ROTATE:
					processRotate(operation.params.dir);
					break;
					
				case MOVEMENT_TYPES.HARD_DROP:
					processHardDrop();
					break;
					
				case MOVEMENT_TYPES.PLACE:
					processPlaceTetromino();
					break;
					
				case MOVEMENT_TYPES.EXPLODE:
					processExplosion(operation.params.x, operation.params.z, operation.params.message);
					break;
					
				case MOVEMENT_TYPES.CLEANUP:
					processCleanup(operation.params.message);
					break;
					
				default:
					console.warn(`Unknown operation type: ${operation.type}`);
			}
		}
		
		// After processing, render the tetromino if it still exists
		if (gameState.currentTetromino && gameState.pendingRender) {
			renderTetromino(gameState);
			gameState.pendingRender = false;
		}
	} catch (error) {
		console.error('Error processing movement queue:', error);
	} finally {
		// Clear the processing flag
		gameState.isProcessingMovementQueue = false;
	}
}

/**
 * Process horizontal movement (X or Z axis)
 * @param {boolean} isXAxis - Whether to move along X axis (true) or Z axis (false)
 * @param {number} dir - Direction to move (-1 or 1)
 */
function processHorizontalMove(isXAxis, dir) {
	// Skip if no tetromino
	if (!gameState.currentTetromino) return;
	
	// Calculate new position
	const newPos = {
		x: isXAxis ? gameState.currentTetromino.position.x + dir : gameState.currentTetromino.position.x,
		z: isXAxis ? gameState.currentTetromino.position.z : gameState.currentTetromino.position.z + dir
	};
	
	// Update position
	gameState.currentTetromino.position = newPos;
	
	// Mark render as pending
	gameState.pendingRender = true;
}

/**
 * Process vertical movement (Y axis)
 * @param {number} height - Target height
 * @param {boolean} isRelative - Whether height is relative to current height
 */
function processVerticalMove(height, isRelative) {
	// Skip if no tetromino
	if (!gameState.currentTetromino) return;
	
	// Calculate target height
	let targetHeight = height;
	if (isRelative) {
		targetHeight = gameState.currentTetromino.heightAboveBoard + height;
	}
	
	// Cap maximum height
	if (targetHeight > gameState.TETROMINO_START_HEIGHT) {
		targetHeight = gameState.TETROMINO_START_HEIGHT;
	}
	
	// --- Refined Logic for Y <= 0 ---
	if (targetHeight < 0) {
		targetHeight = 0;
	}
	
	if (targetHeight === 0) {
		// Reached board level, perform checks
		const shape = gameState.currentTetromino.shape;
		const posX = gameState.currentTetromino.position.x;
		const posZ = gameState.currentTetromino.position.z;
		
		// 1. Check for collisions with existing pieces at Y=0
		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (shape[z][x] === 1) {
					const boardX = posX + x;
					const boardZ = posZ + z;
					const key = `${boardX},${boardZ}`;
					
					if (gameState.board && gameState.board.cells && 
						gameState.board.cells[key] !== undefined && 
						gameState.board.cells[key] !== null) {
						
						// Collision detected! Explode.
						console.log(`Vertical move failed - collision at Y=0 with existing piece at (${boardX}, ${boardZ})`);
						// Ensure tetromino is visually at Y=0 before explosion
						gameState.currentTetromino.heightAboveBoard = 0; 
						queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, {
							x: posX,
							z: posZ,
							message: 'Collision on landing'
						});
						return; // Stop processing this move
					}
				}
			}
		}
		
		// 2. Check adjacency if no collision occurred
		const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(
			gameState,
			shape,
			posX,
			posZ
		);
		
		if (!isAdjacent) {
			// Not adjacent! Explode.
			console.log(`Vertical move failed - tetromino not adjacent at landing position (Y=0)`);
			// Ensure tetromino is visually at Y=0 before explosion
			gameState.currentTetromino.heightAboveBoard = 0; 
			queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, {
				x: posX,
				z: posZ,
				message: 'Tetromino must connect to existing cells'
			});
			return; // Stop processing this move
		}
		
		// If we reach here, it's safe to land at Y=0
		console.log("Vertical move successful - landed at Y=0 adjacently. Queueing PLACE.");
		
		// *** ADDED: Queue the PLACE operation upon successful landing ***
		gameState.currentTetromino.heightAboveBoard = 0; // Ensure height is exactly 0
		gameState.pendingRender = true;
		queueTetrominoMovement(MOVEMENT_TYPES.PLACE, {});
		return; // Stop further height update below, as PLACE handles the final state
	}
	
	// --- End of Refined Logic ---
	
	// Update height if the move was valid (and not a landing handled above)
	gameState.currentTetromino.heightAboveBoard = targetHeight;
	
	// Mark render as pending
	gameState.pendingRender = true;
}

/**
 * Process rotation
 * @param {number} dir - Direction (1 for clockwise, -1 for counterclockwise)
 */
function processRotate(dir) {
	// Skip if no tetromino
	if (!gameState.currentTetromino) return;
	
	// Make a copy of the current shape
	const currentShape = gameState.currentTetromino.shape;
	const size = currentShape.length;
	
	// Create a new rotated shape
	const newShape = [];
	for (let i = 0; i < size; i++) {
		newShape.push(new Array(size).fill(0));
	}
	
	// Rotate the shape matrix
	for (let z = 0; z < size; z++) {
		for (let x = 0; x < size; x++) {
			if (dir === 1) { // Clockwise
				newShape[x][size - 1 - z] = currentShape[z][x];
			} else { // Counterclockwise
				newShape[size - 1 - x][z] = currentShape[z][x];
			}
		}
	}
	
	// Update shape
	gameState.currentTetromino.shape = newShape;
	
	// Mark render as pending
	gameState.pendingRender = true;
}

/**
 * Process hard drop
 */
function processHardDrop() {
	// Skip if no tetromino
	if (!gameState.currentTetromino) return;
	
	console.log('Processing hard drop: Setting Y=0');
	
	// Instantly set height to 0
	gameState.currentTetromino.heightAboveBoard = 0;
	
	// Show drop animation
	showDropAnimation(gameState);
	
	// Mark render as pending. 
	// The consequence of being at Y=0 (placement or explosion) 
	// will be handled by subsequent checks, likely triggered by 
	// the next attempt to move down or during the queue processing cycle.
	gameState.pendingRender = true;
	
	// Check for collisions and adjacency just like in processVerticalMove
	const shape = gameState.currentTetromino.shape;
	const posX = gameState.currentTetromino.position.x;
	const posZ = gameState.currentTetromino.position.z;
	
	// 1. Check for collisions with existing pieces at Y=0
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				const key = `${boardX},${boardZ}`;
				
				if (gameState.board && gameState.board.cells && 
					gameState.board.cells[key] !== undefined && 
					gameState.board.cells[key] !== null) {
					
					// Collision detected! Explode.
					console.log(`Hard drop failed - collision with existing piece at (${boardX}, ${boardZ})`);
					queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, {
						x: posX,
						z: posZ,
						message: 'Collision on landing'
					});
					return; // Stop processing this move
				}
			}
		}
	}
	
	// 2. Check adjacency if no collision occurred
	const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(
		gameState,
		shape,
		posX,
		posZ
	);
	
	if (!isAdjacent) {
		// Not adjacent! Explode.
		console.log(`Hard drop failed - tetromino not adjacent at landing position`);
		queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, {
			x: posX,
			z: posZ,
			message: 'Tetromino must connect to existing cells'
		});
		return; // Stop processing this move
	}
	
	// If we reach here, it's safe to land at Y=0
	console.log("Hard drop successful - landed adjacently. Queueing PLACE.");
	
	// Queue the PLACE operation
	queueTetrominoMovement(MOVEMENT_TYPES.PLACE, {});
}

/**
 * Process tetromino placement
 */
function processPlaceTetromino() {
	// Skip if no tetromino
	if (!gameState.currentTetromino) return;
	
	// Capture original coordinates for later use
	const originalX = gameState.currentTetromino.position.x;
	const originalZ = gameState.currentTetromino.position.z;
	
	// Clean up any ghost piece immediately (we're going to place the real piece)
	cleanupGhostPiece();
	
	// Send tetromino placement data to server and handle the response
	sendTetrominoPlacementToServer(gameState.currentTetromino)
		.then(response => {
			// Server response handling is now mostly in the sendTetrominoPlacementToServer function
			
			// Additional debugging
			if (response && response.placedCells) {
				console.log(`Server confirmed placement of ${response.placedCells.length} cells`);
			}
			
			// If there's a specific position from the server, use it for placement effect
			if (response && response.position) {
				console.log(`Server returned position: (${response.position.x}, ${response.position.z})`);
				showPlacementEffect(response.position.x, response.position.z, gameState);
			}
			
			// If server validated the placement, check if there are valid chess moves
			if (response && response.success === true) {
				// Clear the current tetromino reference since it's now placed
				gameState.currentTetromino = null;
				
				// Explicitly set turn phase to chess
				gameState.turnPhase = 'chess';
				
				// Make sure UI is updated
				if (typeof window.updateGameStatusDisplay === 'function') {
					window.updateGameStatusDisplay();
				}
				
				// Update the board visuals
				if (typeof window.updateBoardVisuals === 'function') {
					window.updateBoardVisuals();
				}
				
				// Log the phase change
				console.log('Placement successful - switched to chess phase:', gameState.turnPhase);
				
				const canMakeChessMove = boardFunctions.analyzePossibleMoves(gameState, gameState.currentPlayer);
				
				// If no valid chess moves, skip to next tetromino turn
				if (!canMakeChessMove.hasMoves) {
					console.log('No valid chess moves available, skipping to next tetromino turn');
					boardFunctions.handleTetrisPhaseClick(gameState, window.updateGameStatusDisplay, window.updateBoardVisuals, gameState.tetrominoGroup, createTetrominoBlock);
				} else {
					console.log('Valid chess moves available, continuing to chess phase');
				}
			} else if (response && response.success === false) {
				// Server explicitly rejected the placement
				console.error('Server rejected placement:', response.error || 'Unknown error');
				showExplosionAnimation(originalX, originalZ, gameState);
				cleanupCurrentTetromino();
			}
		})
		.catch(error => {
			console.error('Error during tetromino placement:', error);
			// Show an explosion at the original position if placement failed
			showExplosionAnimation(originalX, originalZ, gameState);
			cleanupCurrentTetromino();
			processCleanup('Placement failed: ' + (error.message || 'Unknown error'));
		});
}

/**
 * Process explosion
 * @param {number} x - X position for explosion
 * @param {number} z - Z position for explosion
 * @param {string} message - Message to display
 */
function processExplosion(x, z, message) {
	// Show explosion
	showExplosionAnimation(x, z, gameState);
	
	// Queue cleanup
	queueTetrominoMovement(MOVEMENT_TYPES.CLEANUP, {
		message: message || 'Tetromino exploded'
	});
}

/**
 * Process cleanup
 * @param {string} message - Message to display
 */
function processCleanup(message) {
	// Show message
	if (message && typeof showToastMessage === 'function') {
		showToastMessage(message);
	}
	
	console.log('Current turnPhase before cleanup:', gameState.turnPhase);
	
	// Ensure proper cleanup of all tetromino elements
	
	// 1. Remove the current tetromino shape group
	if (gameState.currentTetrominoShapeGroup) {
		if (gameState.tetrominoGroup) {
			gameState.tetrominoGroup.remove(gameState.currentTetrominoShapeGroup);
		}
		gameState.currentTetrominoShapeGroup = null;
	}
	
	// 2. Remove ghost piece if it exists
	if (gameState.ghostTetrominoGroup) {
		if (gameState.tetrominoGroup) {
			gameState.tetrominoGroup.remove(gameState.ghostTetrominoGroup);
		}
		gameState.ghostTetrominoGroup = null;
	}
	
	// 3. Clear any references to the current tetromino
	gameState.currentTetromino = null;
	
	// 4. Reset any other related state
	if (gameState.ghostTetromino) {
		gameState.ghostTetromino = null;
	}
	
	// Switch to chess phase
	gameState.turnPhase = 'chess';
	
	// Update game status display
	if (typeof window.updateGameStatusDisplay === 'function') {
		window.updateGameStatusDisplay();
	}
	
	// Log cleanup completion
	console.log('Tetromino cleanup completed - set turnPhase to:', gameState.turnPhase);
	
	// Update the board visuals
	if (typeof window.updateBoardVisuals === 'function') {
		window.updateBoardVisuals();
	}
}

// Update the existing functions to use the queue system:

export function moveTetrominoX(dir) {
	return queueTetrominoMovement(MOVEMENT_TYPES.MOVE_X, { dir });
}

export function moveTetrominoZ(dir) {
	return queueTetrominoMovement(MOVEMENT_TYPES.MOVE_Z, { dir });
}

export function moveTetrominoY(height, isRelative = true) {
	return queueTetrominoMovement(MOVEMENT_TYPES.MOVE_Y, { height, isRelative });
}

export function rotateTetromino(dir) {
	return queueTetrominoMovement(MOVEMENT_TYPES.ROTATE, { dir });
}

export function hardDropTetromino() {
	return queueTetrominoMovement(MOVEMENT_TYPES.HARD_DROP, {});
}

export function cleanupTetrominoAndTransitionToChess(gameState, message, x, z) {
	return queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, { x, z, message });
}

export function enhancedPlaceTetromino(gameState) {
	// The gameState parameter is ignored as we're using the global gameState,
	// but we keep it for consistency with the calling code
	return queueTetrominoMovement(MOVEMENT_TYPES.PLACE, {});
}

/**
 * Check if there's a path from a cell to a player's king using diagonal connections
 * @param {Object} gameState - The current game state
 * @param {number} startX - Starting X coordinate
 * @param {number} startZ - Starting Z coordinate
 * @param {string} playerId - Player ID to check path for
 * @returns {Array|false} - Array of coordinates forming path to king, or false if no path exists
 */
export function hasPathToKing(gameState, startX, startZ, playerId) {
	if (!gameState.board || !gameState.board.cells) {
		console.error('Invalid board state in hasPathToKing');
		return false;
	}

	// Find the king position
	let kingX = -1;
	let kingZ = -1;

	for (const [key, cell] of Object.entries(gameState.board.cells)) {
		if (cell && cell.type === 'king' && cell.player === playerId) {
			[kingX, kingZ] = key.split(',').map(Number);
			break;
		}
	}

	if (kingX === -1 || kingZ === -1) {
		console.log('King not found for player', playerId);
		return false;
	}

	// BFS to find path to king
	const queue = [{ x: startX, z: startZ, path: [[startX, startZ]] }];
	const visited = new Set([`${startX},${startZ}`]);
	
	// Include diagonal directions
	const directions = [
		{ dx: -1, dz: 0 },  // Left
		{ dx: 1, dz: 0 },   // Right
		{ dx: 0, dz: -1 },  // Up
		{ dx: 0, dz: 1 },   // Down
		{ dx: -1, dz: -1 }, // Top-left
		{ dx: 1, dz: -1 },  // Top-right
		{ dx: -1, dz: 1 },  // Bottom-left
		{ dx: 1, dz: 1 }    // Bottom-right
	];

	while (queue.length > 0) {
		const { x, z, path } = queue.shift();

		// Check if we've reached the king
		if (x === kingX && z === kingZ) {
			return path;
		}

		// Try all eight directions
		for (const { dx, dz } of directions) {
			const newX = x + dx;
			const newZ = z + dz;
			const key = `${newX},${newZ}`;

			// Skip if already visited
			if (visited.has(key)) {
				continue;
			}

			// Skip if cell is empty
			const cell = gameState.board.cells[key];
			if (!cell) {
				continue;
			}

			// Mark as visited and add to queue with updated path
			visited.add(key);
			queue.push({
				x: newX,
				z: newZ,
				path: [...path, [newX, newZ]]
			});
		}
	}

	return false;
}

/**
 * Highlight the path from a tetromino to the king
 * @param {Object} gameState - The current game state
 * @param {Array} path - Array of coordinates forming the path
 */
export function highlightPathToKing(gameState, path) {
	const THREE = getTHREE();
	
	// Remove existing path highlights
	if (gameState.pathHighlights) {
		gameState.pathHighlights.forEach(highlight => {
			gameState.scene.remove(highlight);
		});
	}
	
	gameState.pathHighlights = [];
	
	if (!path || path.length === 0) {
		return;
	}
	
	// Create highlight material
	const highlightMaterial = new THREE.MeshBasicMaterial({
		color: 0xffff00,
		transparent: true,
		opacity: 0.3,
		side: THREE.DoubleSide
	});
	
	// Create highlights for each cell in the path
	path.forEach(([x, z]) => {
		const geometry = new THREE.BoxGeometry(1, 0.1, 1);
		const highlight = new THREE.Mesh(geometry, highlightMaterial);
		highlight.position.set(x + 0.5, 0.1, z + 0.5);
		gameState.scene.add(highlight);
		gameState.pathHighlights.push(highlight);
	});
}

/**
 * Update path visualization as tetromino moves
 * @param {Object} gameState - The current game state
 */
export function updatePathVisualization(gameState) {
	if (!gameState || !gameState.currentTetromino || !gameState.currentPlayer) {
		return;
	}

	const tetromino = gameState.currentTetromino;
	const shape = tetromino.shape;
	const posX = Math.round(tetromino.position.x);
	const posZ = Math.round(tetromino.position.z);

	// First, we'll simulate placing the tetromino on the board to check connectivity
	const simulatedBoard = JSON.parse(JSON.stringify(gameState.board || { cells: {} }));
	if (!simulatedBoard.cells) simulatedBoard.cells = {};
	
	// Add the tetromino cells to the simulated board
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				const key = `${boardX},${boardZ}`;
				simulatedBoard.cells[key] = {
					type: 'tetromino',
					player: gameState.currentPlayer
				};
			}
		}
	}

	// Find any valid path from any cell of the tetromino
	let bestPath = null;
	
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				// Create a temporary gameState for path checking
				const tempGameState = { ...gameState, board: simulatedBoard };
				
				const path = hasPathToKing(tempGameState, posX + x, posZ + z, gameState.currentPlayer);
				if (path && (!bestPath || path.length < bestPath.length)) {
					bestPath = path;
				}
			}
		}
	}

	// Update the visualization with the tetromino's color
	highlightPathToKing(gameState, bestPath, getTetrominoColor(tetromino.type, gameState));
}

// ... existing code ...

// Find the animate function in the module
export function animateWithPathVisualization() {
	// Call the regular animation loop
	if (typeof animate === 'function') {
		animate();
	}
	
	// Then add our path visualization
	if (window.gameState && window.gameState.currentTetromino) {
		updatePathVisualization(window.gameState);
	}
}

// Initialize the animation hook when the module loads
document.addEventListener('DOMContentLoaded', () => {
	// Wait for the game to initialize
	setTimeout(() => {
		// Only set up the hook if it doesn't already exist
		if (typeof window.animate === 'function' && 
			!window.pathVisualizationHooked) {
			const originalAnimate = window.animate;
			window.animate = function() {
				originalAnimate();
				if (window.gameState && window.gameState.currentTetromino) {
					updatePathVisualization(window.gameState);
				}
			};
			window.pathVisualizationHooked = true;
			console.log('Path visualization integrated with animation loop');
		}
	}, 1000); // Give the game time to initialize
});

/**
 * Initialize necessary socket event listeners for tetromino-related events
 * This should be called during game initialization
 */
export function initializeTetrominoSocketListeners() {
	// Get socket from NetworkManager if available
	if (typeof NetworkManager !== 'undefined' && NetworkManager.addEventListener) {
		// Listen for row_cleared events from server
		NetworkManager.addEventListener('row_cleared', handleRowCleared);
		
		// Listen for tetromino placement failed events
		NetworkManager.addEventListener('tetrominoFailed', handleTetrominoFailed);
	} else {
		console.warn('NetworkManager not available, tetromino socket events not initialized');
	}
}

/**
 * Handle row_cleared event from server
 * @param {Object} data - Data about the cleared rows
 */
function handleRowCleared(data) {
	if (!data || !data.rows || !data.rows.length) return;
	
	console.log('Row cleared event received:', data);
	
	// Highlight the rows that were cleared
	highlightClearedRows(data.rows);
	
	// After a short delay, update the game state to reflect changes
	setTimeout(() => {
		if (typeof window.updateBoardVisuals === 'function') {
			window.updateBoardVisuals();
		}
	}, 1000); // 1 second delay to show the highlight effect
}

/**
 * Highlight rows that are being cleared
 * @param {Array} rowIndices - Array of row indices to highlight
 */
function highlightClearedRows(rowIndices) {
	const THREE = getTHREE();
	if (!THREE) return;
	
	// Store existing highlight elements to remove later
	const highlights = [];
	
	// Create highlight material with glowing effect
	const highlightMaterial = new THREE.MeshBasicMaterial({
		color: 0xffff00,
		transparent: true,
		opacity: 0.5,
		side: THREE.DoubleSide
	});
	
	// Add highlight mesh for each row
	rowIndices.forEach(rowIndex => {
		// Create a plane that covers the entire row
		const geometry = new THREE.PlaneGeometry(16, 1);
		const highlight = new THREE.Mesh(geometry, highlightMaterial);
		
		// Position the highlight at the row's position, slightly above the board
		highlight.position.set(8, 0.1, rowIndex);
		highlight.rotation.x = -Math.PI / 2; // Rotate to lay flat
		
		// Add to scene
		if (gameState.scene) {
			gameState.scene.add(highlight);
			highlights.push(highlight);
			
			// Animate the highlight
			const startTime = Date.now();
			const duration = 800; // milliseconds
			
			const animateHighlight = () => {
				const elapsed = Date.now() - startTime;
				if (elapsed < duration) {
					highlight.material.opacity = 0.5 + 0.5 * Math.sin(elapsed / duration * Math.PI * 4);
					requestAnimationFrame(animateHighlight);
				} else {
					// Remove highlight after animation completes
					gameState.scene.remove(highlight);
					highlight.geometry.dispose();
					highlight.material.dispose();
				}
			};
			
			// Start animation
			animateHighlight();
		}
	});
}

/**
 * Handle tetrominoFailed event from server
 * @param {Object} data - Data about the failure
 */
function handleTetrominoFailed(data) {
	console.log('Tetromino placement failed:', data);
	
	// Ensure current tetromino is cleaned up
	if (gameState.currentTetromino) {
		// Capture position before cleanup for potential explosion animation
		const posX = gameState.currentTetromino.position.x;
		const posZ = gameState.currentTetromino.position.z;
		
		// Show explosion animation at the position
		showExplosionAnimation(posX, posZ, gameState);
		
		// Clean up the current tetromino
		cleanupCurrentTetromino();
	}
	
	// Clean up ghost piece as well
	cleanupGhostPiece();
	
	// Show error message if provided
	if (data && data.message) {
		if (typeof window.showToastMessage === 'function') {
			window.showToastMessage(data.message, 'error');
		} else {
			alert('Placement failed: ' + data.message);
		}
	}
}

/**
 * Clean up the current tetromino from scene
 */
function cleanupCurrentTetromino() {
	if (gameState.currentTetromino && gameState.tetrominoGroup) {
		// Remove children from the tetromino group
		while (gameState.tetrominoGroup.children.length > 0) {
			const child = gameState.tetrominoGroup.children[0];
			gameState.tetrominoGroup.remove(child);
			
			// If it's a pooled object, return it to pool
			if (child.userData && child.userData.pooledObject) {
				objectPool.returnTetrominoBlock(child);
			} else {
				// Otherwise dispose of geometry and material
				if (child.geometry) child.geometry.dispose();
				if (child.material) {
					if (Array.isArray(child.material)) {
						child.material.forEach(m => m.dispose());
					} else {
						child.material.dispose();
					}
				}
			}
		}
		
		// Clear the current tetromino reference
		gameState.currentTetromino = null;
	}
}

/**
 * Clean up the ghost piece from scene
 */
function cleanupGhostPiece() {
	if (gameState.ghostPieceGroup && gameState.tetrominoGroup) {
		// Return all ghost blocks to the pool
		if (gameState.ghostPieceGroup.children) {
			while (gameState.ghostPieceGroup.children.length > 0) {
				const child = gameState.ghostPieceGroup.children[0];
				gameState.ghostPieceGroup.remove(child);
				
				// If it's a pooled object, return it to pool
				if (child.userData && child.userData.pooledObject) {
					objectPool.returnTetrominoBlock(child);
				} else {
					// Otherwise dispose of geometry and material
					if (child.geometry) child.geometry.dispose();
					if (child.material) {
						if (Array.isArray(child.material)) {
							child.material.forEach(m => m.dispose());
						} else {
							child.material.dispose();
						}
					}
				}
			}
		}
		
		// Remove ghost group from scene
		gameState.tetrominoGroup.remove(gameState.ghostPieceGroup);
		gameState.ghostPieceGroup = null;
	}
}

/**
 * Update path to king visualization with tetromino color
 * @param {Object} gameState - The current game state
 */
export function updatePathVisualization(gameState) {
	if (!gameState || !gameState.currentTetromino || !gameState.currentPlayer) {
		return;
	}

	const tetromino = gameState.currentTetromino;
	const shape = tetromino.shape;
	const posX = Math.round(tetromino.position.x);
	const posZ = Math.round(tetromino.position.z);

	// First, we'll simulate placing the tetromino on the board to check connectivity
	const simulatedBoard = JSON.parse(JSON.stringify(gameState.board || { cells: {} }));
	if (!simulatedBoard.cells) simulatedBoard.cells = {};
	
	// Add the tetromino cells to the simulated board
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				const key = `${boardX},${boardZ}`;
				simulatedBoard.cells[key] = {
					type: 'tetromino',
					player: gameState.currentPlayer
				};
			}
		}
	}

	// Find any valid path from any cell of the tetromino
	let bestPath = null;
	
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				// Create a temporary gameState for path checking
				const tempGameState = { ...gameState, board: simulatedBoard };
				
				const path = hasPathToKing(tempGameState, posX + x, posZ + z, gameState.currentPlayer);
				if (path && (!bestPath || path.length < bestPath.length)) {
					bestPath = path;
				}
			}
		}
	}

	// Update the visualization
	highlightPathToKing(gameState, bestPath, getTetrominoColor(tetromino.type, gameState));
}

/**
 * Get tetromino color based on type and game state
 * @param {string} tetrominoType - The tetromino type
 * @param {Object} gameState - The current game state
 * @returns {number} - The color as a hex value
 */
function getTetrominoColor(tetrominoType, gameState) {
	let color = 0xffff00; // Default yellow
	
	// Try to use the centralized player color function if available
	if (boardFunctions && boardFunctions.getPlayerColor) {
		try {
			color = boardFunctions.getPlayerColor(tetrominoType, gameState, true);
		} catch (err) {
			console.warn('Error using centralized color function for path:', err);
		}
	}
	
	// Fallback to traditional coloring if needed
	if (color === 0xcccccc) {
		// Map tetromino shape letters to colors
		switch (tetrominoType) {
			case 'I': color = 0x00ffff; break; // Cyan
			case 'J': color = 0x0000ff; break; // Blue
			case 'L': color = 0xff8000; break; // Orange
			case 'O': color = 0xffff00; break; // Yellow
			case 'S': color = 0x00ff00; break; // Green
			case 'T': color = 0x800080; break; // Purple
			case 'Z': color = 0xff0000; break; // Red
			default: color = 0xffff00; break; // Yellow for unknown types
		}
	}
	
	return color;
}

/**
 * Highlight the path from a tetromino to the king
 * @param {Object} gameState - The current game state
 * @param {Array} path - Array of coordinates forming the path
 * @param {number} color - The color to use for highlighting (hex)
 */
export function highlightPathToKing(gameState, path, color = 0xffff00) {
	const THREE = getTHREE();
	
	// Remove existing path highlights
	if (gameState.pathHighlights) {
		gameState.pathHighlights.forEach(highlight => {
			gameState.scene.remove(highlight);
			if (highlight.geometry) highlight.geometry.dispose();
			if (highlight.material) highlight.material.dispose();
		});
	}
	
	gameState.pathHighlights = [];
	
	if (!path || path.length === 0) {
		return;
	}
	
	// Create highlight material with the same color as the tetromino
	const highlightMaterial = new THREE.MeshBasicMaterial({
		color: color,
		transparent: true,
		opacity: 0.3,
		side: THREE.DoubleSide
	});
	
	// Create highlights for each cell in the path
	path.forEach(([x, z]) => {
		const geometry = new THREE.BoxGeometry(1, 0.1, 1);
		const highlight = new THREE.Mesh(geometry, highlightMaterial);
		highlight.position.set(x + 0.5, 0.1, z + 0.5);
		gameState.scene.add(highlight);
		gameState.pathHighlights.push(highlight);
	});
}
