import { updateGameStatusDisplay } from './createLoadingIndicator';
import { getTHREE, PLAYER_COLORS } from './enhanced-gameCore';
import { showToastMessage } from './showToastMessage';
import NetworkManager from './utils/networkManager.js';
import { boardFunctions } from './boardFunctions.js';
import { toRelativePosition, toAbsolutePosition, translatePosition } from './centreBoardMarker.js';

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
export function moveTetrominoX(dir, gameState) {
	if (!gameState.currentTetromino) return false;

	// Make a copy of the current position
	const newPos = {
		x: gameState.currentTetromino.position.x + dir,
		z: gameState.currentTetromino.position.z
	};

	// Check if the move would be valid - pass gameState as first parameter
	if (isValidTetrominoPosition(gameState, gameState.currentTetromino.shape, newPos)) {
		// Update position
		gameState.currentTetromino.position = newPos;
		
		// Re-render tetromino with updated position
		if (gameState.tetrominoGroup) {
			renderTetromino(gameState);
		}
		
		return true;
	}

	return false;
}
/**
 * Move the current tetromino along Z-axis (forward/backward)
 * @param {number} dir - Direction (-1 for forward/toward camera, 1 for backward/away from camera)
 * @returns {boolean} - Whether the move was successful
 */
export function moveTetrominoZ(dir, gameState) {
	if (!gameState.currentTetromino) return false;

	// If moving up in Y-axis, simply adjust the heightAboveBoard property
	if (dir < 0 && gameState.currentTetromino.heightAboveBoard < 10) {
		gameState.currentTetromino.heightAboveBoard += 1;
		console.log(`Moving tetromino up in Y-axis, heightAboveBoard=${gameState.currentTetromino.heightAboveBoard}`);
		
		// Re-render tetromino with updated height
		if (gameState.tetrominoGroup) {
			renderTetromino(gameState);
		}
		
		return true;
	}
	
	// If moving down in Y-axis, check if we're still above the board
	if (dir > 0) {
		if (gameState.currentTetromino.heightAboveBoard > 0) {
			// Still above board, just decrease height
			gameState.currentTetromino.heightAboveBoard -= 1;
			console.log(`Moving tetromino down in Y-axis, heightAboveBoard=${gameState.currentTetromino.heightAboveBoard}`);
			
			// Re-render tetromino with updated height
			if (gameState.tetrominoGroup) {
				renderTetromino(gameState);
			}
			
			return true;
		} else {
			// At board level, check if we can move in Z direction
			const newPos = {
				x: gameState.currentTetromino.position.x,
				z: gameState.currentTetromino.position.z + 1 // Increase Z (away from camera) when moving down
			};
			
			console.log(`Tetromino at board level, checking movement from z=${gameState.currentTetromino.position.z} to z=${newPos.z}`);
			
			// Check if the move would be valid
			if (isValidTetrominoPosition(gameState, gameState.currentTetromino.shape, newPos)) {
				// Update position
				gameState.currentTetromino.position = newPos;
				
				// Re-render tetromino with updated position
				if (gameState.tetrominoGroup) {
					renderTetromino(gameState);
				}
				
				return true;
			}
		}
	}

	return false;
}
/**
 * Move the current tetromino along Y-axis (up/down from the sky)
 * @param {number} dir - Direction (-1 for up, 1 for down)
 * @returns {boolean} - Whether the move was successful
 */
export function moveTetrominoY(dir, gameState) {
	if (!gameState.currentTetromino) return false;

	// Moving up in Y-axis (increasing height above board)
	if (dir < 0 && gameState.currentTetromino.heightAboveBoard < 10) {
		gameState.currentTetromino.heightAboveBoard += 1;
		console.log(`Moving tetromino up in Y-axis, heightAboveBoard=${gameState.currentTetromino.heightAboveBoard}`);
		
		// Re-render tetromino with updated height
		if (gameState.tetrominoGroup) {
			renderTetromino(gameState);
		}
		
		return true;
	}
	
	// Moving down in Y-axis (decreasing height above board)
	if (dir > 0) {
		if (gameState.currentTetromino.heightAboveBoard > 0) {
			// Still above board, just decrease height
			gameState.currentTetromino.heightAboveBoard -= 1;
			console.log(`Moving tetromino down in Y-axis, heightAboveBoard=${gameState.currentTetromino.heightAboveBoard}`);
			
			// Re-render tetromino with updated height
			if (gameState.tetrominoGroup) {
				renderTetromino(gameState);
			}
			
			return true;
		} else {
			// Already at board level, can't move down in Y anymore
			return false;
		}
	}

	return false;
}
/**
 * Move the current tetromino forward/backward along Z-axis on the board
 * @param {number} dir - Direction (-1 for forward/toward camera, 1 for backward/away from camera)
 * @returns {boolean} - Whether the move was successful
 */
export function moveTetrominoForwardBack(dir, gameState) {
	if (!gameState.currentTetromino) return false;
	
	// Only allow Z movement when the piece is at board level
	if (gameState.currentTetromino.heightAboveBoard > 0) {
		return false;
	}

	// Make a copy of the current position
	const newPos = {
		x: gameState.currentTetromino.position.x,
		z: gameState.currentTetromino.position.z + dir
	};
	
	// Check if the move would be valid
	if (isValidTetrominoPosition(gameState, gameState.currentTetromino.shape, newPos)) {
		// Update position
		gameState.currentTetromino.position = newPos;
		
		// Re-render tetromino with updated position
		if (gameState.tetrominoGroup) {
			renderTetromino(gameState);
		}
		
		return true;
	}

	return false;
}
/**
 * Rotate the current tetromino
 * @param {number} dir - Direction (1 for clockwise, -1 for counterclockwise)
 * @returns {boolean} - Whether the rotation was successful
 */
export function rotateTetromino(dir, gameState) {
	if (!gameState.currentTetromino) return false;

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

	// Check if the rotated position is valid - pass gameState as first parameter
	if (isValidTetrominoPosition(gameState, newShape, gameState.currentTetromino.position)) {
		// Update shape
		gameState.currentTetromino.shape = newShape;
		
		// Re-render tetromino with updated shape
		if (gameState.tetrominoGroup) {
			renderTetromino(gameState);
		}
		
		return true;
	}

	return false;
}
/**
 * Hard drop the current tetromino to the lowest valid position
 * @returns {boolean} - Whether the tetromino is ready for placement
 */
export function hardDropTetromino(gameState) {
	if (!gameState.currentTetromino) return false;

	// First, immediately drop to the board level
	gameState.currentTetromino.heightAboveBoard = 0;
	
	// Re-render tetromino at board level
	if (gameState.tetrominoGroup) {
		renderTetromino(gameState);
	}

	// Then keep moving on the board along Z-axis until we hit something
	let moved = true;
	while (moved) {
		moved = moveTetrominoForwardBack(1, gameState);
		// Note: moveTetrominoForwardBack already re-renders the tetromino
	}

	// Play drop animation
	showDropAnimation(gameState);

	// Return true to indicate the tetromino is ready to be placed
	// This avoids directly calling the placement function here
	// as it may be called elsewhere (like in legacy_placeTetromino)
	console.log('Tetromino is ready for placement');
	return true;
}
/**
 * Clean up tetromino state and transition to chess phase
 * @param {Object} gameState - The current game state
 * @param {string} message - Message to show in toast notification
 * @param {number} x - X position for explosion
 * @param {number} z - Z position for explosion
 * @returns {Promise} Promise that resolves after the transition completes
 */
export function cleanupTetrominoAndTransitionToChess(gameState, message, x, z) {
	console.log('Cleaning up tetromino and transitioning to chess phase:', message);
	
	// Show message
	if (message) {
		showToastMessage(message);
	}
	
	// Show explosion effect
	if (typeof x === 'number' && typeof z === 'number') {
		showExplosionAnimation(x, z, gameState);
	}
	
	// Clear the current tetromino reference
	gameState.currentTetromino = null;
	
	// Clear existing tetromino group
	if (gameState.tetrominoGroup) {
		console.log('Clearing tetromino group children:', gameState.tetrominoGroup.children?.length || 0);
		
		if (gameState.tetrominoGroup.children && gameState.tetrominoGroup.children.length > 0) {
			// Clone the array to avoid issues during removal
			const children = [...gameState.tetrominoGroup.children];
			for (const child of children) {
				// Properly dispose of geometry and materials to prevent memory leaks
				if (child.geometry) child.geometry.dispose();
				if (child.material) {
					if (Array.isArray(child.material)) {
						child.material.forEach(m => m.dispose());
					} else {
						child.material.dispose();
					}
				}
				gameState.tetrominoGroup.remove(child);
			}
		}
		
		// Verify cleanup
		console.log('Tetromino group cleaned, remaining children:', gameState.tetrominoGroup.children?.length || 0);
	}
	
	// Make sure tetromino group is reset
	if (gameState.scene && gameState.tetrominoGroup && gameState.scene.children.includes(gameState.tetrominoGroup)) {
		try {
			gameState.scene.remove(gameState.tetrominoGroup);
			console.log('Removed tetromino group from scene');
		} catch (e) {
			console.warn('Error removing tetromino group from scene:', e);
		}
	}
	
	// Create a fresh tetromino group
	const THREE = getTHREE();
	gameState.tetrominoGroup = new THREE.Group();
	gameState.scene.add(gameState.tetrominoGroup);
	
	// Switch to chess phase
	gameState.turnPhase = 'chess';
	updateGameStatusDisplay();
	
	// Attempt to access renderer and camera from various possible sources
	let renderer = gameState.renderer;
	let camera = gameState.camera;
	
	// Check global variables as a fallback
	if (!renderer && typeof window !== 'undefined') {
		renderer = window.renderer || null;
	}
	
	if (!camera && typeof window !== 'undefined') {
		camera = window.camera || null;
	}
	
	// Force a render update if we have the required components
	if (renderer && camera && gameState.scene) {
		console.log('Forcing render update after cleanup');
		renderer.render(gameState.scene, camera);
	} else {
		console.warn('Cannot force render - missing renderer, camera, or scene');
	}
	
	// Try the renderScene function as a fallback
	if (typeof gameState.renderScene === 'function') {
		console.log('Calling renderScene function');
		gameState.renderScene();
	}
	
	// Add a delayed re-render for safety
	setTimeout(() => {
		if (typeof gameState.renderScene === 'function') {
			console.log('Delayed re-render triggered');
			gameState.renderScene();
		} else if (renderer && camera && gameState.scene) {
			console.log('Delayed direct render triggered');
			renderer.render(gameState.scene, camera);
		}
	}, 50);
	
	console.log('Successfully transitioned to chess phase', gameState.turnPhase);
	
	// Return a timeout promise that resolves after the transition
	return new Promise(resolve => setTimeout(resolve, 100));
}
/**
 * Enhanced version of tetromino placement with server integration
 * @param {Object} gameState - The current game state
 * @returns {Promise<boolean>} Promise that resolves to true if placement succeeded, false otherwise
 */
export function enhancedPlaceTetromino(gameState) {
	if (!gameState.currentTetromino) {
		console.log('No current tetromino to place');
		return Promise.resolve(false);
	}

	try {
		// Clone the current tetromino for sending to server
		const tetrominoData = {
			type: gameState.currentTetromino.type,
			shape: gameState.currentTetromino.shape,
			position: { ...gameState.currentTetromino.position },
			player: gameState.currentPlayer
		};

		// Store position for potential explosion effect
		const explosionX = gameState.currentTetromino.position.x;
		const explosionZ = gameState.currentTetromino.position.z;

		console.log('Attempting to place tetromino:', tetrominoData);

		// Check if we can place the tetromino
		// Check if adjacent to existing cells
		const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(
			gameState, 
			gameState.currentTetromino.shape,
			gameState.currentTetromino.position.x,
			gameState.currentTetromino.position.z
		);

		if (!isAdjacent) {
			console.log('Tetromino must be adjacent to existing cells');
			
			// Use the cleanup function and wait for it to complete
			return cleanupTetrominoAndTransitionToChess(
				gameState,
				'Tetromino must be adjacent to existing cells',
				explosionX,
				explosionZ
			).then(() => false);
		}

		// First check if network is connected
		if (!NetworkManager.isConnected()) {
			console.error('Network is not connected. Attempting to reconnect...');
			
			// Import the enhanced-gameCore functions if needed
			let handleNetworkError;
			try {
				// Try to import via the global object first
				if (typeof window !== 'undefined' && window.enhancedGameCore && window.enhancedGameCore.handleNetworkErrorDuringPlacement) {
					handleNetworkError = window.enhancedGameCore.handleNetworkErrorDuringPlacement;
				} else {
					// Try dynamic import
					const enhancedGameCore = require('./enhanced-gameCore.js');
					handleNetworkError = enhancedGameCore.handleNetworkErrorDuringPlacement;
				}
			} catch (e) {
				console.warn('Could not import handleNetworkErrorDuringPlacement, using fallback');
			}
			
			// Use the imported function if available
			if (typeof handleNetworkError === 'function') {
				return handleNetworkError(new Error('Not connected to server'), gameState)
					.then(reconnected => {
						if (reconnected) {
							// Try again with new connection
							console.log('Reconnected to server, retrying tetromino placement');
							return enhancedPlaceTetromino(gameState);
						} else {
							return false;
						}
					});
			} 
			
			// Fallback if the import failed
			return cleanupTetrominoAndTransitionToChess(
				gameState,
				'Network connection lost. Please check your connection and try again.',
				explosionX,
				explosionZ
			).then(() => false);
		}

		// Send tetromino placement to server and return the promise
		return sendTetrominoPlacementToServer(tetrominoData)
			.then(response => {
				if (response && response.success) {
					console.log('Server accepted tetromino placement');
					
					// Successfully placed tetromino, add it to the board locally
					if (typeof boardFunctions.placeTetromino === 'function') {
						boardFunctions.placeTetromino(
							gameState, 
							(x, z) => showPlacementEffect(x, z, gameState),
							updateGameStatusDisplay,
							() => gameState.updateBoardVisuals && gameState.updateBoardVisuals()
						);
					}
					return true;
				} else {
					console.error('Server rejected tetromino placement:', response);
					
					// Check if this was a network error
					if (response.reason === 'network_error') {
						// Import the enhanced-gameCore functions if needed
						let handleNetworkError;
						try {
							// Try to import via the global object first
							if (typeof window !== 'undefined' && window.enhancedGameCore && window.enhancedGameCore.handleNetworkErrorDuringPlacement) {
								handleNetworkError = window.enhancedGameCore.handleNetworkErrorDuringPlacement;
							} else {
								// Try dynamic import
								const enhancedGameCore = require('./enhanced-gameCore.js');
								handleNetworkError = enhancedGameCore.handleNetworkErrorDuringPlacement;
							}
						} catch (e) {
							console.warn('Could not import handleNetworkErrorDuringPlacement, using fallback');
						}
						
						// Use the imported function if available
						if (typeof handleNetworkError === 'function') {
							return handleNetworkError(response.error || new Error(response.message), gameState);
						}
					}
					
					// Show rejection message with details if available
					const reason = response.details?.reason || response.reason || 'Unknown reason';
					const message = response.message || response.details?.message || 'Server rejected placement';
					
					// Customize message based on reason type
					let displayMessage = '';
					if (response.reason === 'validation_error') {
						displayMessage = `Invalid tetromino placement: ${message}`;
					} else {
						displayMessage = `Tetromino placement rejected: ${message}`;
					}
					
					// Use the cleanup function and wait for it to complete
					return cleanupTetrominoAndTransitionToChess(
						gameState,
						displayMessage,
						explosionX,
						explosionZ
					).then(() => false);
				}
			})
			.catch(error => {
				console.error('Error placing tetromino:', error);
				
				// Import the enhanced-gameCore functions if needed
				let handleNetworkError;
				try {
					// Try to import via the global object first
					if (typeof window !== 'undefined' && window.enhancedGameCore && window.enhancedGameCore.handleNetworkErrorDuringPlacement) {
						handleNetworkError = window.enhancedGameCore.handleNetworkErrorDuringPlacement;
					} else {
						// Try dynamic import
						const enhancedGameCore = require('./enhanced-gameCore.js');
						handleNetworkError = enhancedGameCore.handleNetworkErrorDuringPlacement;
					}
				} catch (e) {
					console.warn('Could not import handleNetworkErrorDuringPlacement, using fallback');
				}
				
				// Use the imported function if available
				if (typeof handleNetworkError === 'function') {
					return handleNetworkError(error, gameState);
				}
				
				// Fallback if import failed
				return cleanupTetrominoAndTransitionToChess(
					gameState,
					'Error placing tetromino: ' + (error.message || 'Network error'),
					explosionX, 
					explosionZ
				).then(() => false);
			});

	} catch (error) {
		console.error('Error placing tetromino:', error);
		
		// Use the cleanup function - position might be null if error occurred earlier
		let explosionX, explosionZ;
		if (gameState.currentTetromino) {
			explosionX = gameState.currentTetromino.position.x;
			explosionZ = gameState.currentTetromino.position.z;
		}
		
		// Use the cleanup function and wait for it to complete
		return cleanupTetrominoAndTransitionToChess(
			gameState,
			'Error placing tetromino: ' + (error.message || 'Unknown error'),
			explosionX,
			explosionZ
		).then(() => false);
	}
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
	
	// Determine positions - use original coordinates as the board reference point is handled elsewhere
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
		console.warn('Tetromino: No king found for player ' + currentPlayer + ', No king, no tetromino');
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
			kingDirection = { x: 1, z: 0 };
			break;
		case 2: // Facing down
			kingDirection = { x: 0, z: 1 };
			break;
		case 3: // Facing left
			kingDirection = { x: -1, z: 0 };
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
		console.log(`Rendering tetromino at absolute position (${tetromino.position.x}, ${tetromino.position.z}), height: ${heightAboveBoard}`);
		
		// Position the tetromino group at 0,0,0 (THREE.js scene origin)
		gameState.tetrominoGroup.position.set(0, 0, 0);
		
		// Create blocks for each cell of the tetromino
		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (shape[z][x] === 1) {
					// Calculate the absolute position of the block on the board
					const relativePos = {
						x: tetromino.position.x + x,
						z: tetromino.position.z + z
					};
					
					// Create tetromino block using the relative position
					const block = createTetrominoBlock(
						relativePos.x,
						relativePos.z,
						tetromino.type, 
						false, 
						heightAboveBoard,
						gameState
					);
					
					gameState.tetrominoGroup.add(block);
				}
			}
		}
		
		// If we should show ghost piece
		if (gameState.showTetrisGhost && heightAboveBoard === 0) {
			renderGhostPiece(gameState, tetromino);
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
		const shape = tetromino.shape;
		
		// Create ghost blocks
		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (shape[z][x] === 1) {
					// Calculate absolute position on board
					const absoluteBlockPos = {
						x: ghostPos.x + x,
						z: ghostPos.z + z
					};
					
					// Convert to relative position using translation function
					const relativePos = translatePosition(absoluteBlockPos, gameState, false);
					
					// Create ghost block with relative position
					const ghostBlock = createTetrominoBlock(
						relativePos.x,
						relativePos.z,
						tetromino.type, 
						true, // isGhost = true
						0,    // heightAboveBoard = 0 for ghost
						gameState
					);
					
					gameState.tetrominoGroup.add(ghostBlock);
				}
			}
		}
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
}

/**
 * Handles click on the next piece preview
 * @param {Event} event - The click event
 */
function handleNextPieceClick(event) {
	// Get gameState from the caller or context
	let gameState = event.currentTarget.gameState;
	
	if (!gameState) {
		console.error('No gameState available for next piece click handler');
		return;
	}
	
	// Only proceed if we're in chess phase
	if (gameState.turnPhase !== 'chess') {
		console.log('Already in tetris phase, ignoring click', gameState.turnPhase);
		// Add a small shake animation to indicate it's not clickable now
		const nextTetrominoDisplay = document.getElementById('next-tetromino-display');
		if (nextTetrominoDisplay) {
			nextTetrominoDisplay.style.transition = 'transform 0.1s ease-in-out';
			nextTetrominoDisplay.style.transform = 'translateX(3px)';
			setTimeout(() => {
				nextTetrominoDisplay.style.transform = 'translateX(-3px)';
				setTimeout(() => {
					nextTetrominoDisplay.style.transform = 'translateX(0)';
				}, 100);
			}, 100);
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
	if (typeof updateGameStatusDisplay === 'function') {
		updateGameStatusDisplay();
	}
	
	// 3. Update the hint text
	updateNextPieceHint(gameState);
	
	// 4. Initialize the next tetromino from the bag
	gameState.currentTetromino = initializeNextTetromino(gameState);
	
	// 5. Render the new tetromino
	renderTetromino(gameState);
	
	// 6. If there's a function to handle turn phase changes, call it
	if (typeof gameState.handleTurnPhaseChange === 'function') {
		gameState.handleTurnPhaseChange('tetris');
	}
	
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