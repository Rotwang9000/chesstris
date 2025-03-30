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
		
		// Position particles around the tetromino shape for more realistic explosion
		particle.position.set(
			x + Math.random() * 4 - 2,  // Wider spread
			Math.random() * 3 + 0.5,    // Higher spread
			z + Math.random() * 4 - 2   // Wider spread
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
	const flashGeometry = new THREE.PlaneGeometry(10, 10);
	const flashMaterial = new THREE.MeshBasicMaterial({
		color: 0xFFFFFF,
		transparent: true,
		opacity: 0.8,
		side: THREE.DoubleSide
	});
	
	const flash = new THREE.Mesh(flashGeometry, flashMaterial);
	flash.position.set(x, 1, z);
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

	// Start animation
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
	const THREE = getTHREE();
	console.log('Sending tetromino placement to server:', tetrominoData);

	// Check if connected to the network
	if (!NetworkManager.isConnected()) {
		console.error('Not connected to server. This is an online-only game.');
		
		// Show a toast message to the user
		if (typeof showToastMessage === 'function') {
			showToastMessage('Connection lost. Attempting to reconnect...');
		}
		
		// Try to reconnect with an improved backoff strategy
		// Use 5 maximum attempts with proper backoff
		return NetworkManager.ensureConnected(null, 5)
			.then(connected => {
				if (connected) {
					console.log('Reconnected to server, retrying tetromino placement');
					
					// Ensure gameId is set in case we reconnected to a different session
					const gameId = NetworkManager.getGameId();
					if (gameId) {
						// Now try again with the connection restored and gameId confirmed
						const enrichedData = {
							...tetrominoData,
							gameId: gameId
						};
						return NetworkManager.submitTetrominoPlacement(enrichedData);
					} else {
						console.error('No gameId available after reconnection');
						return { 
							success: false, 
							reason: 'network_error',
							message: 'Failed to rejoin game after reconnection'
						};
					}
				} else {
					// Still not connected after multiple attempts
					console.error('Failed to reconnect to server after multiple attempts');
					return { 
						success: false, 
						reason: 'network_error',
						message: 'Unable to connect to server after multiple attempts. Please check your connection and refresh the page.'
					};
				}
			})
			.catch(error => {
				console.error('Error during reconnection process:', error);
				return { 
					success: false, 
					reason: 'network_error',
					message: 'Network connection error. Please refresh the page and try again.'
				};
			});
	}

	// Debug gameId and playerId
	const gameId = NetworkManager.getGameId();
	const playerId = NetworkManager.getPlayerId();

	console.log(`Debug - gameId: ${gameId}, playerId: ${playerId}`);

	// If gameId is missing, try to join a game first
	if (!gameId) {
		console.log('No gameId detected, attempting to join/create a game first');
		return NetworkManager.joinGame()
			.then(gameData => {
				console.log('Joined game:', gameData);
				// Force update of gameId in the NetworkManager if needed
				if (gameData && gameData.gameId) {
					console.log('Setting gameId manually:', gameData.gameId);
					// Check if NetworkManager has an updateGameId method, if not this is a no-op
					if (typeof NetworkManager.updateGameId === 'function') {
						NetworkManager.updateGameId(gameData.gameId);
					}
				}
				// Now try again with the newly joined game
				return NetworkManager.submitTetrominoPlacement(tetrominoData);
			})
			.then(response => {
				if (response && response.success) {
					console.log('Server accepted tetromino placement after joining game');
					return response;
				} else {
					console.error('Server rejected tetromino placement after joining game:', response);
					// Return a rejection object with details
					return { 
						success: false, 
						reason: 'validation_error',
						details: response,
						message: response?.error || response?.message || 'Server rejected placement'
					};
				}
			})
			.catch(error => {
				console.error('Error connecting to server during tetromino placement:', error);
				
				// Distinguish between network errors and validation errors
				const isNetworkError = error.message?.includes('connect') || 
									   error.message?.includes('network') ||
									   error.message?.includes('timeout') ||
									   !NetworkManager.isConnected();
				
				return { 
					success: false, 
					reason: isNetworkError ? 'network_error' : 'validation_error',
					message: error.message || (isNetworkError ? 'Network error' : 'Placement validation error'),
					error: error
				};
			});
	}

	// Ensure pieceType is set properly - this is what the server expects
	const modifiedData = {
		...tetrominoData,
		pieceType: tetrominoData.type, // Add pieceType property matching the type
		gameId: gameId // Ensure gameId is included
	};

	console.log('Modified tetromino data for server:', modifiedData);

	// Return a promise
	return NetworkManager.submitTetrominoPlacement(modifiedData)
		.then(response => {
			if (response && response.success) {
				console.log('Server accepted tetromino placement');
				return response;
			} else {
				console.error('Server rejected tetromino placement:', response);
				// Return a rejection object with details - mark as validation error not network error
				return { 
					success: false, 
					reason: 'validation_error',
					details: response,
					message: response?.error || response?.message || 'Server rejected placement'
				};
			}
		})
		.catch(error => {
			console.error('Error sending tetromino placement to server:', error);
			
			// Check if this is a connection error
			if (error.message?.includes('connect') || !NetworkManager.isConnected()) {
				console.log('Connection appears to be lost, attempting to reconnect...');
				
				// Show message to user
				if (typeof showToastMessage === 'function') {
					showToastMessage('Connection lost during placement. Attempting to reconnect...');
				}
				
				// Try to reconnect with backoff
				return NetworkManager.ensureConnected(null, 3)
					.then(reconnected => {
						if (reconnected) {
							console.log('Reconnected successfully, retrying placement');
							// Try placement again after successful reconnection
							return sendTetrominoPlacementToServer(tetrominoData);
						} else {
							console.error('Failed to reconnect after connection lost');
							return { 
								success: false, 
								reason: 'network_error',
								message: 'Unable to reconnect to server. Please refresh the page and try again.'
							};
						}
					});
			}
			
			// For all non-network errors, treat as validation errors
			return { 
				success: false, 
				reason: 'validation_error',
				message: error.message || 'Server validation error',
				error: error
			};
		});
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
		// Clear existing tetromino visualization
		while (gameState.tetrominoGroup.children.length > 0) {
			const child = gameState.tetrominoGroup.children[0];
			if (child.dispose) child.dispose();
			gameState.tetrominoGroup.remove(child);
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
		
		// If we should show ghost piece
		if (gameState.showTetrisGhost && heightAboveBoard === 0) {
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
		z: tetromino.position.z
	};
	
	// Find the drop position by simulating forward moves
	let canMove = true;
	while (canMove) {
		const testPos = {
			x: ghostPos.x,
			z: ghostPos.z + 1 // Move forward (away from camera) which is Z+
		};
		
		// Check if position is valid
		if (isValidTetrominoPosition(gameState, tetromino.shape, testPos)) {
			ghostPos.z += 1;
		} else {
			canMove = false;
		}
	}
	
	// Only show ghost if it's different from current position
	if (ghostPos.z > tetromino.position.z) {
		// Get absolute world position for the ghost tetromino origin
		const absPos = translatePosition(ghostPos, gameState, true);
		
		// Create a shape group for the ghost
		const THREE = getTHREE();
		const ghostGroup = new THREE.Group();
		
		// Position the ghost group at the absolute position
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
						block.material.emissive = { r: 0, g: 0, b: 0 };
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
		
		// Clear canvas
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
	
	// Check if we're at or near board level (heightAboveBoard <= 1)
	if (gameState.currentTetromino.heightAboveBoard <= 1) {
		// Check if the tetromino would be adjacent to existing cells at the new position
		const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(
			gameState,
			gameState.currentTetromino.shape,
			newPos.x,
			newPos.z
		);
		
		// If not adjacent and at board level, queue an explosion
		if (!isAdjacent) {
			console.log(`Horizontal move rejected - tetromino not adjacent at new position`);
			
			// Queue explosion instead
			queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, {
				x: gameState.currentTetromino.position.x,
				z: gameState.currentTetromino.position.z,
				message: 'Tetromino must connect to existing cells'
			});
			
			return;
		}
	}
	
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
	
	// Check if we're trying to go to or below board level
	if (targetHeight <= 1) {
		// Check for collisions with cells below
		const shape = gameState.currentTetromino.shape;
		const posX = gameState.currentTetromino.position.x;
		const posZ = gameState.currentTetromino.position.z;
		
		// Check each cell for collisions
		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (shape[z][x] === 1) {
					// Check if position is occupied
					const boardX = posX + x;
					const boardZ = posZ + z;
					const key = `${boardX},${boardZ}`;
					
					if (gameState.board && gameState.board.cells && 
						gameState.board.cells[key] !== undefined && 
						gameState.board.cells[key] !== null) {
						console.log(`Vertical move rejected - collision at (${boardX}, ${boardZ})`);
						return;
					}
				}
			}
		}
		
		// Check adjacency when at board level
		if (targetHeight <= 1) {
			const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(
				gameState,
				shape,
				posX,
				posZ
			);
			
			// If not adjacent and trying to land, queue an explosion
			if (!isAdjacent) {
				console.log(`Vertical move rejected - tetromino not adjacent at landing position`);
				
				// Set height to 0 first so explosion happens at board level
				gameState.currentTetromino.heightAboveBoard = 0;
				
				// Queue explosion
				queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, {
					x: posX,
					z: posZ,
					message: 'Tetromino must connect to existing cells'
				});
				
				return;
			}
		}
	}
	
	// Update height
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
	
	// Check adjacency if at board level
	if (gameState.currentTetromino.heightAboveBoard <= 1) {
		const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(
			gameState,
			newShape,
			gameState.currentTetromino.position.x,
			gameState.currentTetromino.position.z
		);
		
		// If not adjacent at board level, reject rotation
		if (!isAdjacent) {
			console.log(`Rotation rejected - would not be adjacent after rotation`);
			
			// Queue explosion if at board level
			if (gameState.currentTetromino.heightAboveBoard === 0) {
				queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, {
					x: gameState.currentTetromino.position.x,
					z: gameState.currentTetromino.position.z,
					message: 'Tetromino must connect to existing cells'
				});
			}
			
			return;
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
	
	// First drop to board level
	gameState.currentTetromino.heightAboveBoard = 0;
	
	// Check adjacency
	const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(
		gameState,
		gameState.currentTetromino.shape,
		gameState.currentTetromino.position.x,
		gameState.currentTetromino.position.z
	);
	
	// If not adjacent, queue explosion
	if (!isAdjacent) {
		console.log(`Hard drop rejected - tetromino not adjacent at landing position`);
		
		// Queue explosion
		queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, {
			x: gameState.currentTetromino.position.x,
			z: gameState.currentTetromino.position.z,
			message: 'Tetromino must connect to existing cells'
		});
		
		return;
	}
	
	// Move forward a bit (Z+)
	const stepsToMove = 10;
	for (let i = 0; i < stepsToMove; i++) {
		// Update position
		gameState.currentTetromino.position.z += 1;
		
		// Check adjacency after movement
		const stillAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(
			gameState,
			gameState.currentTetromino.shape,
			gameState.currentTetromino.position.x,
			gameState.currentTetromino.position.z
		);
		
		// If lost adjacency, revert the last move and stop
		if (!stillAdjacent) {
			console.log(`Hard drop stopped - lost adjacency at step ${i+1}`);
			gameState.currentTetromino.position.z -= 1;
			break;
		}
	}
	
	// Show drop animation
	showDropAnimation(gameState);
	
	// Mark render as pending
	gameState.pendingRender = true;
	
	// Queue placement
	queueTetrominoMovement(MOVEMENT_TYPES.PLACE, {});
}

/**
 * Process tetromino placement
 */
function processPlaceTetromino() {
	// Skip if no tetromino
	if (!gameState.currentTetromino) return;
	
	// Place the tetromino on the board
	const shape = gameState.currentTetromino.shape;
	const posX = gameState.currentTetromino.position.x;
	const posZ = gameState.currentTetromino.position.z;
	const player = gameState.currentPlayer;
	
	console.log(`Placing tetromino at (${posX}, ${posZ})`);
	
	// Ensure board structure exists
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
	
	if (!gameState.board.cells) {
		gameState.board.cells = {};
	}
	
	// Place each block on the board
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// Set the cell
				const key = `${boardX},${boardZ}`;
				gameState.board.cells[key] = {
					type: 'tetromino',
					player: player
				};
				
				console.log(`Placed block at (${boardX}, ${boardZ})`);
			}
		}
	}
	
	// Display placement effect
	showPlacementEffect(posX, posZ, gameState);
	
	// Switch to chess phase
	gameState.turnPhase = 'chess';
	
	// Update game status display
	if (typeof window.updateGameStatusDisplay === 'function') {
		window.updateGameStatusDisplay();
	}
	
	// Clear current tetromino
	gameState.currentTetromino = null;
	
	// Update the board visuals
	if (typeof window.updateBoardVisuals === 'function') {
		window.updateBoardVisuals();
	}
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
	
	// Remove the current tetromino
	if (gameState.currentTetrominoShapeGroup) {
		if (gameState.tetrominoGroup) {
			gameState.tetrominoGroup.remove(gameState.currentTetrominoShapeGroup);
		}
		gameState.currentTetrominoShapeGroup = null;
	}
	
	// Clear current tetromino
	gameState.currentTetromino = null;
	
	// Switch to chess phase
	gameState.turnPhase = 'chess';
	
	// Update game status display
	if (typeof window.updateGameStatusDisplay === 'function') {
		window.updateGameStatusDisplay();
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

export function enhancedPlaceTetromino() {
	return queueTetrominoMovement(MOVEMENT_TYPES.PLACE, {});
}