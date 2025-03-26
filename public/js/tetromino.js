import { updateGameStatusDisplay } from './createLoadingIndicator';
import { THREE, PLAYER_COLORS } from './enhanced-gameCore';
import { showToastMessage } from './showToastMessage';
import * as NetworkManager from './utils/networkManager';


// Object pool for frequently used game objects
const objectPool = {
	tetrominoBlocks: [],
	maxPoolSize: 100, // Maximum number of objects to keep in pool

	// Get block from pool or create new
	getTetrominoBlock: function () {
		if (this.tetrominoBlocks.length > 0) {
			return this.tetrominoBlocks.pop();
		}

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
	}
};


/**
 * Move the current tetromino horizontally
 * @param {number} dir - Direction (-1 for left, 1 for right)
 * @returns {boolean} - Whether the move was successful
 */
export function moveTetrominoHorizontal(dir) {
	if (!gameState.currentTetromino) return false;

	// Make a copy of the current position
	const newPos = {
		x: gameState.currentTetromino.position.x + dir,
		z: gameState.currentTetromino.position.z
	};

	// Check if the move would be valid
	if (legacy_isValidTetrominoPosition(gameState.currentTetromino.shape, newPos)) {
		// Update position
		gameState.currentTetromino.position = newPos;
		return true;
	}

	return false;
}
/**
 * Move the current tetromino vertically
 * @param {number} dir - Direction (-1 for up, 1 for down)
 * @returns {boolean} - Whether the move was successful
 */
export function moveTetrominoVertical(dir) {
	if (!gameState.currentTetromino) return false;

	// Make a copy of the current position - IMPORTANT: For the board, Z is the "vertical" direction
	const newPos = {
		x: gameState.currentTetromino.position.x,
		z: gameState.currentTetromino.position.z + dir
	};

	// Check if the move would be valid
	if (legacy_isValidTetrominoPosition(gameState.currentTetromino.shape, newPos)) {
		// Update position
		gameState.currentTetromino.position = newPos;
		return true;
	}

	return false;
}
/**
 * Rotate the current tetromino
 * @param {number} dir - Direction (1 for clockwise, -1 for counterclockwise)
 * @returns {boolean} - Whether the rotation was successful
 */
export function rotateTetromino(dir) {
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

	// Check if the rotated position is valid
	if (legacy_isValidTetrominoPosition(newShape, gameState.currentTetromino.position)) {
		// Update shape
		gameState.currentTetromino.shape = newShape;
		return true;
	}

	return false;
}
/**
 * Hard drop the current tetromino to the lowest valid position
 */
export function hardDropTetromino() {
	if (!gameState.currentTetromino) return;

	// Keep moving down until we hit something
	let moved = true;
	while (moved) {
		moved = moveTetrominoVertical(1);
	}

	// Play drop animation
	showDropAnimation();

	// Now place the tetromino with enhanced functionality
	enhancedPlaceTetromino();
}
/**
 * Enhanced version of tetromino placement with server integration
 */
function enhancedPlaceTetromino() {
	if (!gameState.currentTetromino) return;

	try {
		// Clone the current tetromino for sending to server
		const tetrominoData = {
			type: gameState.currentTetromino.type,
			shape: gameState.currentTetromino.shape,
			position: { ...gameState.currentTetromino.position },
			player: gameState.currentPlayer
		};

		// Check if we can place the tetromino
		// First check if adjacent to existing cells (unless it's the first player's first piece)
		let isPlayerFirstPiece = false;

		// Count existing cells for the current player
		const playerCellCount = Object.values(gameState.board.cells || {})
			.filter(cell => cell && cell.player === gameState.currentPlayer)
			.length;

		if (playerCellCount === 0) {
			isPlayerFirstPiece = true;
		}

		if (!isPlayerFirstPiece && !legacy_isTetrominoAdjacentToExistingCells(
			gameState.currentTetromino.shape,
			gameState.currentTetromino.position.x,
			gameState.currentTetromino.position.z
		)) {
			console.log('Tetromino must be adjacent to existing cells');
			showToastMessage('Tetromino must be adjacent to existing cells');

			// Show explosion and proceed to chess phase
			showExplosionAnimation(
				gameState.currentTetromino.position.x,
				gameState.currentTetromino.position.z
			);

			// Clear the current tetromino
			gameState.currentTetromino = null;

			// Clear existing tetromino group
			while (tetrominoGroup.children.length > 0) {
				tetrominoGroup.remove(tetrominoGroup.children[0]);
			}

			// Switch to chess phase
			gameState.turnPhase = 'chess';
			updateGameStatusDisplay();

			return;
		}

		// Send tetromino placement to server
		sendTetrominoPlacementToServer(tetrominoData);

	} catch (error) {
		console.error('Error placing tetromino:', error);
		showToastMessage('Error placing tetromino');
	}
}
/**
 * Show drop animation for hard drops
 */
function showDropAnimation() {
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
 * @param {number} x - X position
 * @param {number} z - Z position
 */
function showExplosionAnimation(x, z) {
	// Create particle group
	const particleGroup = new THREE.Group();
	scene.add(particleGroup);

	// Create particles
	const particleCount = 30;
	for (let i = 0; i < particleCount; i++) {
		const size = Math.random() * 0.3 + 0.1;
		const geometry = new THREE.BoxGeometry(size, size, size);
		const material = new THREE.MeshBasicMaterial({
			color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
			transparent: true,
			opacity: 0.8
		});

		const particle = new THREE.Mesh(geometry, material);
		particle.position.set(
			x + Math.random() * 3 - 1.5,
			Math.random() * 2 + 0.5,
			z + Math.random() * 3 - 1.5
		);

		// Add velocity for animation
		particle.userData.velocity = {
			x: Math.random() * 0.2 - 0.1,
			y: Math.random() * 0.3 + 0.1,
			z: Math.random() * 0.2 - 0.1
		};

		particleGroup.add(particle);
	}

	// Animate the explosion
	let lifetime = 0;
	const animate = () => {
		lifetime++;

		// Update particles
		particleGroup.children.forEach(particle => {
			// Apply velocity
			particle.position.x += particle.userData.velocity.x;
			particle.position.y += particle.userData.velocity.y;
			particle.position.z += particle.userData.velocity.z;

			// Apply gravity
			particle.userData.velocity.y -= 0.01;

			// Fade out
			if (particle.material) {
				particle.material.opacity = 0.8 * (1 - lifetime / 30);
			}
		});

		// Continue animation if not done
		if (lifetime < 30) {
			requestAnimationFrame(animate);
		} else {
			// Remove particles
			scene.remove(particleGroup);
		}
	};

	// Start animation
	animate();
}
/**
 * Send tetromino placement to server
 * @param {Object} tetrominoData - Tetromino data to send
 */
function sendTetrominoPlacementToServer(tetrominoData) {
	console.log('Sending tetromino placement to server:', tetrominoData);

	// Check if connected to the network
	if (!NetworkManager.isConnected()) {
		console.warn('Not connected to server. Continuing with local placement only.');
		// Still continue with the local placement
		return Promise.resolve({ success: true });
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
					// Instead of throwing an error, return a rejection object
					return { success: false, reason: 'rejected' };
				}
			})
			.catch(error => {
				console.error('Error connecting to server during tetromino placement:', error);
				// Connection error - reject with error
				throw error;
			});
	}

	// Ensure pieceType is set properly - this is what the server expects
	const modifiedData = {
		...tetrominoData,
		pieceType: tetrominoData.type // Add pieceType property matching the type
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
				// Instead of throwing an error, return a rejection object
				return { success: false, reason: 'rejected' };
			}
		})
		.catch(error => {
			console.error('Error sending tetromino placement to server:', error);
			// Connection error - reject with error
			throw error;
		});
}
/**
 * Show an effect when a tetromino is placed
 * @param {number} x - X position
 * @param {number} z - Z position
 */
function showPlacementEffect(x, z) {
	// Create simple particles at the placement location
	const particleCount = 20;
	const particleGroup = new THREE.Group();
	scene.add(particleGroup);

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
		particle.position.set(
			x + Math.random() * 3 - 1.5,
			0.5,
			z + Math.random() * 3 - 1.5
		);

		// Add velocity
		particle.userData.velocity = {
			x: (Math.random() - 0.5) * 0.2,
			y: Math.random() * 0.3 + 0.1,
			z: (Math.random() - 0.5) * 0.2
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
				particle.material.opacity = 0.8 * (1 - lifetime / 30);
			}
		});

		// Continue animation if not done
		if (lifetime < 30) {
			requestAnimationFrame(animate);
		} else {
			// Remove particles
			scene.remove(particleGroup);
		}
	};

	// Start animation
	animate();
}/**
 * Creates a tetromino block at the specified position - this is still needed
 * as it's called by the boardFunctions module
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number|string} playerType - Player identifier
 * @param {boolean} isGhost - Whether this is a ghost piece to show landing position
 * @param {number} heightAboveBoard - Height above the board (y position)
 * @returns {THREE.Object3D} The created tetromino block
 */
export function createTetrominoBlock(x, z, playerType, isGhost = false, heightAboveBoard = 0) {
	// Get a mesh from object pool
	const block = objectPool.getTetrominoBlock();

	// Get material color based on player type
	let color = 0xcccccc; // Default gray


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

	// Position block
	const heightPos = isGhost ? 0.1 : (0.6 + heightAboveBoard);
	block.position.set(x, heightPos, z);

	block.castShadow = !isGhost;
	block.receiveShadow = !isGhost;

	// Store type info for identification
	block.userData = {
		type: isGhost ? 'ghostBlock' : 'tetrominoBlock',
		playerType: playerType,
		pooledObject: true // Mark as pooled for proper disposal
	};

	// Create a wrapper group to hold the block
	const blockGroup = new THREE.Group();
	blockGroup.add(block);
	blockGroup.position.set(0, 0, 0);

	// Add dispose method to properly return to pool
	blockGroup.dispose = function () {
		// Return the mesh to the pool
		if (this.children.length > 0) {
			const mesh = this.children[0];
			objectPool.returnTetrominoBlock(mesh);
			this.remove(mesh);
		}
	};

	// Store reference to the pooled block
	blockGroup.userData = {
		type: isGhost ? 'ghostBlock' : 'tetrominoBlock',
		playerType: playerType,
		pooledMesh: block
	};

	return blockGroup;
}

