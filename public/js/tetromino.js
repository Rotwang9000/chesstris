import { updateGameStatusDisplay } from './createLoadingIndicator';
import { getTHREE, getPlayerColors } from './gameContext.js';
const PLAYER_COLORS = getPlayerColors();
import { showToastMessage } from './showToastMessage';
import NetworkManager from './utils/networkManager.js';
import { boardFunctions } from './boardFunctions.js';
import { toRelativePosition, toAbsolutePosition, translatePosition } from './centreBoardMarker.js';
// Import the gameState singleton at the top of the file
import gameState from './utils/gameState.js';
// Import sponsor utilities
import { fetchNextSponsor, displaySponsorInfo, onTetrominoPlaced } from '../utils/sponsors.js';

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
			const reused = this.tetrominoBlocks.pop();
			reused.visible = true;
			return reused;
		}
		const THREE = getTHREE();

		const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
		const material = new THREE.MeshStandardMaterial({
			color: 0x000000,
			metalness: 0.3,
			roughness: 0.7,
			transparent: false
		});

		const mesh = new THREE.Mesh(geometry, material);
		return mesh;
	},

	// Return block to pool
	returnTetrominoBlock: function (mesh) {
		if (this.tetrominoBlocks.length >= this.maxPoolSize) {
			if (mesh.geometry) mesh.geometry.dispose();
			if (mesh.material) mesh.material.dispose();
			return;
		}

		mesh.visible = false;
		mesh.scale.set(1, 1, 1);
		mesh.position.set(0, 0, 0);

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
				color: 0x000000,
				metalness: 0.3,
				roughness: 0.7,
				transparent: false
			});
			
			const mesh = new THREE.Mesh(geometry, material);
			mesh.visible = false;
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
							'Missed connection - tetromino dissolved into sand.',
							explosionX,
							explosionZ,
							FAILURE_EFFECTS.DISSOLVE_FALL
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
 * @param {number} x - X position (board coordinates, relative to player)
 * @param {number} z - Z position (board coordinates, relative to player)
 * @param {Object} gameState - The current game state
 */
const MAX_ACTIVE_EXPLOSIONS = 6;
const activeExplosionIds = new Set();

function showExplosionAnimation(x, z, gameState) {
	const THREE = getTHREE();
	if (!THREE || !gameState?.scene) return;
	if (activeExplosionIds.size >= MAX_ACTIVE_EXPLOSIONS) return;

	const effectId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	activeExplosionIds.add(effectId);

	const particleGroup = new THREE.Group();
	particleGroup.name = `explosion-${effectId}`;
	gameState.scene.add(particleGroup);

	if (typeof playSound === 'function') {
		playSound('explosion');
	}

	const isLowProfile = gameState.lowQuality || gameState.renderProfile === 'cute' || gameState.retroMode || gameState.renderProfile === 'retro';
	const particleCount = isLowProfile ? 10 : 18;
	const particles = [];
	const absolutePos = translatePosition({ x, z }, gameState, true);
	const centerX = absolutePos.x;
	const centerZ = absolutePos.z;

	for (let i = 0; i < particleCount; i++) {
		const size = Math.random() * 0.22 + 0.08;
		const geometry = new THREE.BoxGeometry(size, size, size);
		const usePlayerColor = Math.random() > 0.5;
		let color;
		if (usePlayerColor && gameState.currentPlayer && PLAYER_COLORS[gameState.currentPlayer]) {
			color = new THREE.Color(PLAYER_COLORS[gameState.currentPlayer]);
		} else {
			color = new THREE.Color().setHSL(Math.random() * 0.1 + 0.05, 0.8, 0.6);
		}
		const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
		const particle = new THREE.Mesh(geometry, material);
		particle.position.set(
			centerX + Math.random() * 1.2 - 0.6,
			Math.random() * 1.3 + 0.3,
			centerZ + Math.random() * 1.2 - 0.6
		);
		particle.userData.velocity = {
			x: Math.random() * 0.22 - 0.11,
			y: Math.random() * 0.28 + 0.16,
			z: Math.random() * 0.22 - 0.11
		};
		particle.userData.rotation = {
			x: (Math.random() - 0.5) * 0.14,
			y: (Math.random() - 0.5) * 0.14,
			z: (Math.random() - 0.5) * 0.14
		};
		particleGroup.add(particle);
		particles.push(particle);
	}

	const flashGeometry = new THREE.SphereGeometry(0.7, 10, 8);
	const flashMaterial = new THREE.MeshBasicMaterial({
		color: 0xFFFFFF,
		transparent: true,
		opacity: 0.8,
		wireframe: true
	});
	const flash = new THREE.Mesh(flashGeometry, flashMaterial);
	flash.position.set(centerX, 0.6, centerZ);
	flash.scale.set(1.05, 0.55, 1.05);
	particleGroup.add(flash);
	particles.push(flash);

	let lifetime = 0;
	let animationFrameId = null;
	const maxLifetime = isLowProfile ? 16 : 22;
	const startTime = Date.now();

	const cleanup = () => {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		activeExplosionIds.delete(effectId);
		if (!particleGroup || !gameState.scene) return;
		gameState.scene.remove(particleGroup);
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
		particles.length = 0;
	};

	const animate = () => {
		if (Date.now() - startTime > 1400) {
			cleanup();
			return;
		}
		lifetime++;
		particleGroup.children.forEach(particle => {
			if (particle === flash) {
				particle.material.opacity = 0.8 * Math.max(0, 1 - (lifetime * 2 / 30));
				particle.scale.multiplyScalar(1.02);
				return;
			}
			particle.position.x += particle.userData.velocity.x;
			particle.position.y += particle.userData.velocity.y;
			particle.position.z += particle.userData.velocity.z;
			if (particle.userData.rotation) {
				particle.rotation.x += particle.userData.rotation.x;
				particle.rotation.y += particle.userData.rotation.y;
				particle.rotation.z += particle.userData.rotation.z;
			}
			particle.userData.velocity.y -= 0.017;
			if (particle.material) {
				particle.material.opacity = 0.9 * (1 - lifetime / maxLifetime);
			}
		});
		if (lifetime < maxLifetime) {
			animationFrameId = requestAnimationFrame(animate);
		} else {
			cleanup();
		}
	};

	animate();
	setTimeout(() => {
		if (animationFrameId) cleanup();
	}, 1800);
}

if (typeof window !== 'undefined') {

	window.showExplosionAnimation = showExplosionAnimation;
	window.showSandDissolveCellAnimation = (x, z, gameState) => {
		showSandDissolveFallAnimation(x, z, [[1]], gameState);
	};
}

/**
 * Show a miss effect: tetromino falls through and dissolves like sand.
 * @param {number} x - X position (board coordinates)
 * @param {number} z - Z position (board coordinates)
 * @param {Array<Array<number>>} shape - Tetromino shape matrix
 * @param {Object} gameState - Current game state
 */
function showSandDissolveFallAnimation(x, z, shape, gameState) {
	const THREE = getTHREE();
	if (!gameState?.scene || !shape) return;

	const particleGroup = new THREE.Group();
	particleGroup.name = 'sand-dissolve-' + Date.now();
	gameState.scene.add(particleGroup);

	const absPos = translatePosition({ x, z }, gameState, true);
	const particles = [];
	const sandPalette = [0xE5D3A1, 0xD9C58A, 0xBDA469, 0x9F8754];

	for (let row = 0; row < shape.length; row++) {
		for (let col = 0; col < shape[row].length; col++) {
			if (shape[row][col] !== 1) continue;
			const cellX = absPos.x + col + 0.5;
			const cellZ = absPos.z + row + 0.5;
			for (let i = 0; i < 16; i++) {
				const size = 0.05 + Math.random() * 0.06;
				const geo = new THREE.BoxGeometry(size, size, size);
				const mat = new THREE.MeshBasicMaterial({
					color: sandPalette[Math.floor(Math.random() * sandPalette.length)],
					transparent: true,
					opacity: 0.95
				});
				const p = new THREE.Mesh(geo, mat);
				p.position.set(
					cellX + (Math.random() - 0.5) * 0.85,
					0.4 + Math.random() * 0.5,
					cellZ + (Math.random() - 0.5) * 0.85
				);
				p.userData.velocity = {
					x: (Math.random() - 0.5) * 0.045,
					y: -(0.08 + Math.random() * 0.08),
					z: (Math.random() - 0.5) * 0.045
				};
				p.userData.spin = {
					x: (Math.random() - 0.5) * 0.12,
					y: (Math.random() - 0.5) * 0.12,
					z: (Math.random() - 0.5) * 0.12
				};
				particleGroup.add(p);
				particles.push(p);
			}
		}
	}

	let frame = 0;
	const maxFrames = 65;
	let animationFrameId = null;

	const cleanup = () => {
		if (animationFrameId) cancelAnimationFrame(animationFrameId);
		if (gameState.scene) gameState.scene.remove(particleGroup);
		for (const p of particles) {
			if (p.geometry) p.geometry.dispose();
			if (p.material) p.material.dispose();
		}
		particles.length = 0;
	};

	const animate = () => {
		frame++;
		const t = frame / maxFrames;
		for (const p of particles) {
			p.position.x += p.userData.velocity.x;
			p.position.y += p.userData.velocity.y;
			p.position.z += p.userData.velocity.z;
			p.userData.velocity.y -= 0.0045;
			p.userData.velocity.x *= 0.985;
			p.userData.velocity.z *= 0.985;
			p.rotation.x += p.userData.spin.x;
			p.rotation.y += p.userData.spin.y;
			p.rotation.z += p.userData.spin.z;
			if (p.material) {
				p.material.opacity = Math.max(0, 0.95 * (1 - t));
			}
			p.scale.multiplyScalar(0.992);
		}

		if (gameState.renderer && gameState.scene && gameState.camera) {
			gameState.renderer.render(gameState.scene, gameState.camera);
		}

		if (frame < maxFrames) {
			animationFrameId = requestAnimationFrame(animate);
		} else {
			cleanup();
		}
	};

	animate();
	setTimeout(cleanup, 2500);
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
			
			// Server-side cooldown / rate limiting
			if (error && error.reason === 'rate_limited') {
				const retryAfterMs = error.retryAfterMs || error.details?.retryAfterMs;
				return {
					success: false,
					reason: 'rate_limited',
					retryAfterMs,
					message: 'rate_limited',
					error: error
				};
			}
			
			// Preserve server-provided placement reasons when available
			if (error && error.reason === 'validation_error' && error.details) {
				return {
					success: false,
					reason: error.details.reason || 'validation_error',
					message: error.details.message || error.message || 'Server rejected placement',
					error: error
				};
			}
			
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
		// Wait for server authority before exploding to avoid false-negative client mismatch noise.
		console.log('Local validation failed; awaiting server authority for final outcome.');
	}
	
	// Return a promise that resolves when server validation completes
	return ensureConnectedAndSend().then(response => {
		const serverAccepted = response && response.success;

		// Server is authoritative — apply silent correction on disagreement.
		// Final user-facing success/failure visuals are handled by processPlaceTetromino.
		if (serverAccepted !== isLocallyValid) {
			console.warn('Client/server validation mismatch — server:', serverAccepted, 'local:', isLocallyValid);
			cleanupCurrentTetromino();
			cleanupGhostPiece();
			if (typeof window.updateBoardVisuals === 'function') {
				window.updateBoardVisuals();
			}
		} else if (typeof window.updateBoardVisuals === 'function') {
			window.updateBoardVisuals();
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
	const playerId = gameState.currentPlayer;
	const isFirstPlacement = !gameState?._hasPlacedTetromino;

	// Server-side truth (see `server.js` -> socket.on('tetromino_placed') and `server/game/TetrominoManager.js`):
	// - The server validates placement at y=0 (it does not use client-provided y).
	// - "Occupied" means the cell contains ANY non-home content (home markers alone do NOT block).
	// - Placement must connect (orthogonal adjacency) to the player's own territory (non-home) OR their home markers.

	// 1) Collision check (match server: non-home blocks).
	const hasCollision = checkTetrominoCollision(gameState, shape, posX, posZ);
	if (hasCollision) {
		console.log('Local validation: Collision detected');
		return false;
	}

	// Helper to normalize board cell into an array of items.
	const getCellItems = (cell) => {
		if (cell === null || cell === undefined) return [];
		if (Array.isArray(cell)) return cell;
		if (typeof cell === 'object' && Array.isArray(cell.contents)) return cell.contents;
		return [cell];
	};

	// Helper predicates aligned with server semantics.
	const isOwnedNonHome = (item) =>
		item &&
		String(item.player) === String(playerId) &&
		String(item.type) !== 'home';

	const isOwnedHome = (item) =>
		item &&
		String(item.player) === String(playerId) &&
		String(item.type) === 'home';

	// 2) Adjacency check (orthogonal only — matching server island rules)
	let sawAdjacentPlayerContent = false;

	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] !== 1) continue;

			const blockX = posX + x;
			const blockZ = posZ + z;

			const adjacentPositions = [
				{ x: blockX - 1, z: blockZ },
				{ x: blockX + 1, z: blockZ },
				{ x: blockX, z: blockZ - 1 },
				{ x: blockX, z: blockZ + 1 },
			];

			for (const pos of adjacentPositions) {
				const cell = gameState.board.cells?.[`${pos.x},${pos.z}`];
				const items = getCellItems(cell);
				if (items.length === 0) continue;

				if (items.some(isOwnedNonHome)) {
					sawAdjacentPlayerContent = true;
					if (isFirstPlacement) return true;

					try {
						const hasPath = hasPathToKing(
							{ ...gameState, board: gameState.board },
							pos.x, pos.z, playerId
						);
						if (hasPath) return true;
					} catch (_) { /* continue to next cell */ }
				}

				if (items.some(isOwnedHome)) {
					if (isFirstPlacement) return true;
				}
			}
		}
	}

	if (sawAdjacentPlayerContent) {
		console.log('Local validation: adjacent cells found but none connect to king');
	}
	return false;
}

/**
 * Show local placement effect immediately after client-side validation
 * @param {Object} tetrominoData - The tetromino data
 */
function showLocalPlacementEffect(tetrominoData) {
	const posX = tetrominoData.position.x;
	const posZ = tetrominoData.position.z;
	
	showPlacementEffect(posX, posZ, gameState);
	
	if (typeof window.updateBoardVisuals === 'function') {
		window.updateBoardVisuals();
	}
}

/**
 * Show local explosion effect immediately after client-side validation
 * @param {Object} tetrominoData - The tetromino data
 */
function showLocalExplosionEffect(tetrominoData) {
	const posX = tetrominoData.position.x;
	const posZ = tetrominoData.position.z;
	
	showExplosionAnimation(posX, posZ, gameState);
	
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

	cleanupCurrentTetromino();
	cleanupGhostPiece();
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

	cleanupCurrentTetromino();
	cleanupGhostPiece();
}

/**
 * Show an effect when a tetromino is placed
 * @param {number} x - X position on the board 
 * @param {number} z - Z position on the board
 * @param {Object} gameState - The current game state
 */
export function showPlacementEffect(x, z, gameState) {
	const THREE = getTHREE();
	if (!THREE) return;

	let targetScene;
	if (gameState && gameState.scene) {
		targetScene = gameState.scene;
	} else if (typeof scene !== 'undefined') {
		targetScene = scene;
	} else {
		return;
	}

	const absPos = translatePosition({ x, z }, gameState, true);
	const effectX = absPos.x;
	const effectZ = absPos.z;

	const particleCount = 12;
	const particleGroup = new THREE.Group();
	targetScene.add(particleGroup);

	const playerColour = gameState.playerColor || 0x44AAFF;

	for (let i = 0; i < particleCount; i++) {
		const size = Math.random() * 0.12 + 0.05;
		const geometry = new THREE.BoxGeometry(size, size, size);
		const material = new THREE.MeshBasicMaterial({
			color: playerColour,
			transparent: true,
			opacity: 0.7
		});

		const particle = new THREE.Mesh(geometry, material);
		particle.position.set(
			effectX + Math.random() - 0.5,
			0.5,
			effectZ + Math.random() - 0.5
		);
		particle.userData.velocity = {
			x: (Math.random() - 0.5) * 0.1,
			y: Math.random() * 0.25 + 0.1,
			z: (Math.random() - 0.5) * 0.1
		};
		particleGroup.add(particle);
	}

	let lifetime = 0;
	const animate = () => {
		lifetime += 1;
		for (const particle of particleGroup.children) {
			particle.position.x += particle.userData.velocity.x;
			particle.position.y += particle.userData.velocity.y;
			particle.position.z += particle.userData.velocity.z;
			particle.userData.velocity.y -= 0.012;
			if (particle.material) {
				particle.material.opacity = Math.max(0, 0.7 - (lifetime / 18));
			}
		}
		if (lifetime < 18) {
			requestAnimationFrame(animate);
		} else {
			try {
				targetScene.remove(particleGroup);
				for (const p of particleGroup.children) {
					if (p.geometry) p.geometry.dispose();
					if (p.material) p.material.dispose();
				}
			} catch (_e) { /* cleanup best effort */ }
		}
	};
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
	const isRetro = gameState && gameState.retroMode;
	if (block.material) {
		block.material.color.setHex(color);
		block.material.transparent = isGhost;
		block.material.opacity = isGhost ? 0.3 : 1.0;
		block.material.wireframe = isGhost || isRetro;
		if (isRetro && !isGhost) {
			block.material.emissive = new THREE.Color(color);
			block.material.emissiveIntensity = 0.6;
		} else {
			block.material.emissive = new THREE.Color(0x000000);
			block.material.emissiveIntensity = 0;
		}
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
export function determineInitialTetrominoPosition(gameState, shapeOverride = null) {

	
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
		return null;
	}
	
	// Translate orientation to direction vector
	let kingDirection;
	switch (kingOrientation) {
		case 0: // Facing up
			// In-game convention (matches server + camera): orientation 0 faces +Z
			kingDirection = { x: 0, z: 1 };
			break;
		case 1: // Facing right
			// orientation 1 faces +X
			kingDirection = { x: 1, z: 0 };
			break;
		case 2: // Facing down
			// orientation 2 faces -Z
			kingDirection = { x: 0, z: -1 };
			break;
		case 3: // Facing left
			// orientation 3 faces -X
			kingDirection = { x: -1, z: 0 };
			break;
		default:
			kingDirection = { x: 0, z: 1 }; // Default to facing up (+Z)
	}
	
	// Create right vector (perpendicular to king direction)
	const rightVector = {
		x: -kingDirection.z, // Perpendicular to forward direction
		z: kingDirection.x
	};

	// Determine which shape to test for collision/adjacency
	const shapeToTest = Array.isArray(shapeOverride) ? shapeOverride : (gameState.currentTetromino?.shape || null);
	if (!shapeToTest) {
		console.warn('Tetromino: No shape available for spawn search; using a 1x1 fallback.');
	}
	const collisionShape = shapeToTest || [[1]];

	const MAX_LATERAL_OFFSET = 6;
	const MIN_FORWARD_DISTANCE = 1;
	const MAX_FORWARD_DISTANCE = 20;
	const MAX_CANDIDATES = 6;

	const buildOffsets = (maxAbs) => {
		const offsets = [0];
		for (let i = 1; i <= maxAbs; i++) {
			offsets.push(i, -i);
		}
		return offsets;
	};

	const lateralOffsets = buildOffsets(MAX_LATERAL_OFFSET);
	const candidates = [];

	const tryAddCandidate = (posX, posZ, requireAdjacency) => {
		const testPos = { x: posX, z: posZ };
		if (!isValidTetrominoPosition(gameState, collisionShape, testPos)) return false;
		if (requireAdjacency && !isTetrominoAdjacentToExistingCells(gameState, collisionShape, posX, posZ)) return false;
		candidates.push({ x: posX, z: posZ });
		return true;
	};

	// Prefer spawn points "in front" of the king that will land adjacent (prevents instant explosion on landing)
	for (let forwardDistance = MIN_FORWARD_DISTANCE; forwardDistance <= MAX_FORWARD_DISTANCE; forwardDistance++) {
		for (const lateralOffset of lateralOffsets) {
			const testX = kingPosition.x + (rightVector.x * lateralOffset) + (kingDirection.x * forwardDistance);
			const testZ = kingPosition.z + (rightVector.z * lateralOffset) + (kingDirection.z * forwardDistance);

			const posX = Math.round(testX);
			const posZ = Math.round(testZ);

			if (tryAddCandidate(posX, posZ, true) && candidates.length >= MAX_CANDIDATES) {
				forwardDistance = MAX_FORWARD_DISTANCE + 1;
				break;
			}
		}
	}

	// Fallback: any collision-free spawn (player can still move into adjacency)
	if (candidates.length === 0) {
		for (let forwardDistance = MIN_FORWARD_DISTANCE; forwardDistance <= MAX_FORWARD_DISTANCE; forwardDistance++) {
			for (const lateralOffset of lateralOffsets) {
				const testX = kingPosition.x + (rightVector.x * lateralOffset) + (kingDirection.x * forwardDistance);
				const testZ = kingPosition.z + (rightVector.z * lateralOffset) + (kingDirection.z * forwardDistance);

				const posX = Math.round(testX);
				const posZ = Math.round(testZ);

				if (tryAddCandidate(posX, posZ, false) && candidates.length >= MAX_CANDIDATES) {
					forwardDistance = MAX_FORWARD_DISTANCE + 1;
					break;
				}
			}
		}
	}

	const chosen = candidates.length > 0
		? candidates[Math.floor(Math.random() * candidates.length)]
		: { x: kingPosition.x, z: kingPosition.z };

	console.log(`Initial tetromino spawn selected: (${chosen.x}, ${chosen.z}) candidates=${candidates.length}`);

	return {
		x: chosen.x,
		z: chosen.z,
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

	// Get the initial position based on king + shape
	const initialPosition = determineInitialTetrominoPosition(gameState, shape);
	
	console.log('Initial tetromino position', initialPosition);

	if(!initialPosition) {
		console.log('Tetromino: No initial position found, returning null');
		return null;
	}
	
	// Create the tetromino object
	const tetromino = {
		type: type,
		shape: shape,
		position: {
			x: initialPosition.x,
			z: initialPosition.z
		},
		heightAboveBoard: initialPosition.heightAboveBoard,
		sponsor: null // Will be populated asynchronously
	};
	
	// Fetch sponsor asynchronously (non-blocking)
	fetchNextSponsor().then(sponsor => {
		if (sponsor) {
			tetromino.sponsor = sponsor;
			console.log('Sponsor attached to tetromino:', sponsor.name);
		}
	}).catch(err => {
		console.warn('Could not fetch sponsor for tetromino:', err);
	});
	
	return tetromino;
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
		
		const absPos = translatePosition(tetromino.position, gameState, true);
		
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
						block.material.emissiveIntensity = 0;
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
					
					// Ghost material — higher opacity + dashed outline
				// for visibility against the busy board.
					if (block.material) {
						block.material.color.setHex(color);
						block.material.transparent = true;
						block.material.opacity = 0.5;
						block.material.wireframe = true;
						block.material.wireframeLinewidth = 2;
						if (block.material.emissive) {
							block.material.emissive.setHex(color);
							block.material.emissiveIntensity = 0.4;
						}
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
	// Use the same collision semantics as server validation:
	// only NON-home content blocks.
	if (!position) return false;
	const collided = checkTetrominoCollision(gameState, shape, position.x, position.z);
	if (collided && gameState?.debugMode) {
		console.log(`Collision detected for tetromino at (${position.x}, ${position.z})`);
	}
	return !collided;
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

	cleanupCurrentTetromino();

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
	const currentPlayer = gameState?.currentPlayer || gameState?.localPlayerId;

	if (!gameState?.board?.cells || Object.keys(gameState.board.cells).length === 0) {
		return true;
	}

	const playerStr = currentPlayer ? String(currentPlayer) : null;

	// Orthogonal-only adjacency (matching server island rules).
	// The server is authoritative — this is just a fast client hint.
	const ORTHO = [[0, -1], [0, 1], [-1, 0], [1, 0]];
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (!shape[z][x]) continue;
			const blockX = posX + x;
			const blockZ = posZ + z;

			for (const [dx, dz] of ORTHO) {
				const key = `${blockX + dx},${blockZ + dz}`;
				const cell = gameState.board.cells[key];
				if (!cell) continue;
				const items = Array.isArray(cell) ? cell : (cell.contents || [cell]);
				const owned = items.some(item =>
					item && playerStr && String(item.player) === playerStr
				);
				if (owned) return true;
			}
		}
	}

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
	// Shaktris server-side rules (see server/game/TetrominoManager.js):
	// - Board is sparse and can expand; do NOT clamp to boardBounds.
	// - A cell is considered "occupied" only if it contains any NON-home content.
	//   Cells containing only home markers are allowed to be built upon.
	if (!gameState?.board?.cells) return false;

	const cellHasNonHomeContent = (cell) => {
		if (cell === null || cell === undefined) return false;

		// Normalize to an array of items.
		const items = Array.isArray(cell)
			? cell
			: (typeof cell === 'object' && Array.isArray(cell.contents))
				? cell.contents
				: [cell];

		// Match server semantics: anything that is not an explicit home marker blocks placement.
		// Also ignore purely-client metadata markers (centre markers, etc.).
		return items.some(item => {
			if (!item) return true; // unknown/invalid item => treat as blocking
			
			// Support marker-only cells that exist client-side for positioning/debugging.
			// These should not block placement.
			if (!item.type && item.specialMarker) return false;
			
			const t = String(item.type || '');
			return !(t === 'home' || t === 'specialMarker' || t === 'boardCentre');
		});
	};

	// For each block in the tetromino
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;

				const key = `${boardX},${boardZ}`;
				const cell = gameState.board.cells[key];
				if (cellHasNonHomeContent(cell)) {
					if (gameState?.debugMode) {
						console.log(`Collision (non-home) at (${boardX}, ${boardZ}) with:`, cell);
					}
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
		// Make it discoverable/clickable for accessibility (and automated testing)
		nextTetrominoDisplay.setAttribute('role', 'button');
		nextTetrominoDisplay.setAttribute('aria-label', 'Next piece: click to start tetris turn');
		nextTetrominoDisplay.tabIndex = 0;
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
		nextTetrominoDisplay.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				handleNextPieceClick(e);
			}
		});
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
		nextTetrominoDisplay.setAttribute(
			'aria-label',
			gameState.turnPhase === 'chess'
				? 'Next piece: click to start tetris turn'
				: 'Next piece: tetris turn active'
		);
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
		console.log('Next piece click ignored (not in chess phase):', gameState.turnPhase);
		// Add a small shake + message to indicate it's not clickable right now
		const alertElement = document.createElement('div');
		alertElement.textContent = 'Finish your tetris drop first';
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
		
		// Keep the current phase unchanged, just update hint/accessibility state
		updateNextPieceHint(gameState);
		
		// Prevent this click from bubbling into the 3D canvas handlers
		try { event?.stopPropagation?.(); } catch (_) {}
		try { event?.preventDefault?.(); } catch (_) {}

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

const FAILURE_EFFECTS = {
	EXPLODE: 'explode',
	DISSOLVE_FALL: 'dissolve_fall'
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
					processExplosion(
						operation.params.x,
						operation.params.z,
						operation.params.message,
						operation.params.effect || FAILURE_EFFECTS.EXPLODE
					);
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
			// Not adjacent — let it fall through and dissolve.
			console.log(`Vertical move failed - tetromino not adjacent at landing position (Y=0)`);
			// Ensure tetromino is visually at Y=0 before dissolve
			gameState.currentTetromino.heightAboveBoard = 0; 
			queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, {
				x: posX,
				z: posZ,
				message: 'Missed connection - tetromino dissolved into sand.',
				effect: FAILURE_EFFECTS.DISSOLVE_FALL
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
	
	if (checkTetrominoCollision(gameState, shape, posX, posZ)) {
		console.log(`Hard drop failed - collision at (${posX}, ${posZ})`);
		queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, {
			x: posX,
			z: posZ,
			message: 'Collision on landing'
		});
		return;
	}
	
	// 2. Check adjacency if no collision occurred
	const isAdjacent = boardFunctions.isTetrominoAdjacentToExistingCells(
		gameState,
		shape,
		posX,
		posZ
	);
	
	if (!isAdjacent) {
		// Not adjacent — let it fall through and dissolve.
		console.log(`Hard drop failed - tetromino not adjacent at landing position`);
		queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, {
			x: posX,
			z: posZ,
			message: 'Missed connection - tetromino dissolved into sand.',
			effect: FAILURE_EFFECTS.DISSOLVE_FALL
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
	if (gameState.isSubmittingTetrominoPlacement) return;
	gameState.isSubmittingTetrominoPlacement = true;
	
	// Capture original coordinates for later use
	const originalX = gameState.currentTetromino.position.x;
	const originalZ = gameState.currentTetromino.position.z;
	
	// Capture sponsor data before the tetromino is cleared
	const placedTetrominoSponsor = gameState.currentTetromino.sponsor;
	
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
				// Track that we've successfully placed at least one tetromino this session.
				// This helps the client-side adjacency rule match the server (home-zone adjacency only for first placement).
				gameState._hasPlacedTetromino = true;
				
				// Display sponsor ad if this tetromino had a sponsor
				if (placedTetrominoSponsor) {
					console.log('Displaying sponsor ad for:', placedTetrominoSponsor.name);
					displaySponsorInfo(placedTetrominoSponsor);
				}

				// Clear the tetromino visuals and reference
				cleanupCurrentTetromino();
				
				// Update the board visuals first so the new cells are visible
				if (typeof window.updateBoardVisuals === 'function') {
					window.updateBoardVisuals();
				}
				
				// Log the phase change
				console.log('Placement successful. Server hasValidMoves:', response.hasValidMoves);
				
				// Trust the server's hasValidMoves flag
				if (response.hasValidMoves === false) {
					// Server says no valid chess moves - the server will send a new_tetromino event
					console.log('Server says no valid chess moves - waiting for new tetromino');
					gameState.turnPhase = 'tetris';
					
					if (typeof showToastMessage === 'function') {
						showToastMessage('No chess moves available - next piece incoming');
					}
				} else {
					// We have valid chess moves, switch to chess phase
					gameState.turnPhase = 'chess';
					console.log('Valid chess moves available, switched to chess phase');
					
					if (typeof showToastMessage === 'function') {
						showToastMessage('Make your chess move!');
					}
				}
				
				// Make sure UI is updated
				if (typeof window.updateGameStatusDisplay === 'function') {
					window.updateGameStatusDisplay();
				}
			} else if (response && response.success === false) {
				// Server explicitly rejected the placement
				if (response.reason === 'rate_limited' || response.error === 'rate_limited' || response.message === 'rate_limited') {
					const retryAfterMs = Number(response.retryAfterMs || 0);
					const seconds = retryAfterMs > 0 ? Math.max(0.1, Math.ceil(retryAfterMs / 100) / 10) : null;
					
					if (typeof showToastMessage === 'function') {
						showToastMessage(seconds ? `Too fast. Placing in ${seconds}s...` : 'Too fast. Placing shortly...');
					}
					
					// Keep the tetromino and retry placement after the cooldown.
					// Guard against stacking retries.
					if (gameState._placementRetryTimeoutId) {
						clearTimeout(gameState._placementRetryTimeoutId);
					}
					
					gameState._placementRetryTimeoutId = setTimeout(() => {
						if (gameState.currentTetromino && gameState.turnPhase === 'tetris') {
							queueTetrominoMovement(MOVEMENT_TYPES.PLACE, {});
						}
					}, Math.max(0, retryAfterMs));
					
					return;
				}
				
				// Show a helpful reason (if provided)
				let rejectionMessage = 'Missed drop - tetromino dissolved into sand.';
				let rejectionEffect = FAILURE_EFFECTS.EXPLODE;
				try {
					const reason = response.reason;
					let message = response.message;
					
					if (!message && reason) {
						switch (reason) {
							case 'occupied':
								message = 'That space is already occupied.';
								rejectionEffect = FAILURE_EFFECTS.EXPLODE;
								break;
							case 'not_adjacent':
								message = 'Missed connection - tetromino dissolved into sand.';
								rejectionEffect = FAILURE_EFFECTS.DISSOLVE_FALL;
								break;
							case 'no_path_to_king':
								message = 'No king path - tetromino dissolved into sand.';
								rejectionEffect = FAILURE_EFFECTS.DISSOLVE_FALL;
								break;
							default:
								message = 'Placement rejected - tetromino exploded.';
								rejectionEffect = FAILURE_EFFECTS.EXPLODE;
						}
					}
					if (reason === 'not_adjacent' || reason === 'no_path_to_king') {
						rejectionEffect = FAILURE_EFFECTS.DISSOLVE_FALL;
					}
					if (message) rejectionMessage = message;
				} catch (e) {
					// Ignore toast errors
				}
				
				console.error('Server rejected placement:', response.reason || response.error || 'Unknown error');
				processExplosion(originalX, originalZ, rejectionMessage, rejectionEffect);
			}
		})
		.catch(error => {
			console.error('Error during tetromino placement:', error);
			processExplosion(
				originalX,
				originalZ,
				'Placement failed - tetromino exploded.',
				FAILURE_EFFECTS.EXPLODE
			);
		})
		.finally(() => {
			gameState.isSubmittingTetrominoPlacement = false;
		});
}

/**
 * Process explosion — remove tetromino visuals first, then animate.
 * @param {number} x - X position for explosion
 * @param {number} z - Z position for explosion
 * @param {string} message - Message to display
 * @param {string} effect - Visual effect type (explode or dissolve_fall)
 */
function processExplosion(x, z, message, effect = FAILURE_EFFECTS.EXPLODE) {
	const shapeSnapshot = gameState.currentTetromino?.shape
		? gameState.currentTetromino.shape.map(row => row.slice())
		: null;

	// Remove the tetromino blocks immediately so they don't linger as a
	// white/grey square underneath the particle explosion.
	if (gameState.currentTetrominoShapeGroup) {
		if (gameState.tetrominoGroup) {
			gameState.tetrominoGroup.remove(gameState.currentTetrominoShapeGroup);
		}
		gameState.currentTetrominoShapeGroup = null;
	}
	cleanupCurrentTetromino();
	cleanupGhostPiece();

	if (effect === FAILURE_EFFECTS.DISSOLVE_FALL) {
		showSandDissolveFallAnimation(x, z, shapeSnapshot, gameState);
	} else {
		showExplosionAnimation(x, z, gameState);
	}

	// Run cleanup inline instead of queueing — the tetromino is already gone,
	// so we just need to handle the phase transition and messaging.
	processCleanup(message || 'Tetromino exploded');
}

/**
 * Process cleanup after a tetromino explosion or failed placement.
 * Always performs phase transition — never skips it.
 * @param {string} message - Message to display
 */
function processCleanup(message) {
	if (message && typeof showToastMessage === 'function') {
		showToastMessage(message);
	}

	console.log('Current turnPhase before cleanup:', gameState.turnPhase);

	// Ensure all tetromino visuals are gone
	if (gameState.currentTetrominoShapeGroup) {
		if (gameState.tetrominoGroup) {
			gameState.tetrominoGroup.remove(gameState.currentTetrominoShapeGroup);
		}
		gameState.currentTetrominoShapeGroup = null;
	}
	cleanupGhostPiece();
	gameState.currentTetromino = null;
	gameState.ghostTetromino = null;

	// Determine next phase: chess if moves exist, otherwise new tetromino
	const activePlayerId = gameState.localPlayerId || gameState.currentPlayer || gameState.myPlayerId;
	let hasChessMoves = true;
	if (boardFunctions.analyzePossibleMoves && typeof boardFunctions.analyzePossibleMoves === 'function' && activePlayerId != null) {
		try {
			hasChessMoves = (boardFunctions.analyzePossibleMoves(gameState, activePlayerId)?.allMoves?.length || 0) > 0;
		} catch (_) {
			hasChessMoves = true;
		}
	}

	if (hasChessMoves) {
		console.log('Tetromino exploded, valid chess moves exist — switching to chess phase');
		gameState.turnPhase = 'chess';
	} else {
		console.log('Tetromino exploded, no valid chess moves — giving new tetromino');
		gameState.turnPhase = 'tetris';
		const newTetromino = initializeNextTetromino(gameState);
		if (newTetromino) {
			gameState.currentTetromino = newTetromino;
			gameState.currentTetromino.heightAboveBoard = gameState.TETROMINO_START_HEIGHT || 20;
		}
	}

	console.log('Tetromino cleanup completed, phase:', gameState.turnPhase);

	if (typeof window.updateBoardVisuals === 'function') {
		window.updateBoardVisuals();
	}
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

export function cleanupTetrominoAndTransitionToChess(gameState, message, x, z, effect = FAILURE_EFFECTS.EXPLODE) {
	return queueTetrominoMovement(MOVEMENT_TYPES.EXPLODE, { x, z, message, effect });
}

export function enhancedPlaceTetromino(gameState) {
	// The gameState parameter is ignored as we're using the global gameState,
	// but we keep it for consistency with the calling code
	return queueTetrominoMovement(MOVEMENT_TYPES.PLACE, {});
}

/**
 * Check if there's a path from a cell to a player's king using orthogonal connections
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

	const playerStr = String(playerId);

	const cellHasKing = (cell) => {
		if (!cell) return false;
		
		// Helper to check if item is a king (case-insensitive)
		const isKing = (item) => {
			if (!item || item.type !== 'chess') return false;
			const pt = String(item.pieceType || '').toUpperCase();
			return pt === 'KING' && String(item.player) === playerStr;
		};
		
		// New format: array of layered objects
		if (Array.isArray(cell)) {
			return cell.some(isKing);
		}
		// Mixed legacy: { contents: [...] }
		if (typeof cell === 'object' && Array.isArray(cell.contents)) {
			return cell.contents.some(isKing);
		}
		// Very legacy: { type: 'king', player }
		const legacyType = String(cell.type || '').toLowerCase();
		return legacyType === 'king' && String(cell.player) === playerStr;
	};

	const cellIsOwnedTerritory = (cell) => {
		if (!cell) return false;
		const isOwnedItem = (item) =>
			item &&
			String(item.player) === playerStr &&
			(item.type === 'home' || item.type === 'tetromino' || item.type === 'chess');

		// New format: array of layered objects
		if (Array.isArray(cell)) {
			return cell.some(isOwnedItem);
		}

		// Mixed legacy: { contents: [...] }
		if (typeof cell === 'object' && Array.isArray(cell.contents)) {
			return cell.contents.some(isOwnedItem);
		}

		// Legacy single object
		return isOwnedItem(cell);
	};

	// Find the king position
	let kingX = -1;
	let kingZ = -1;

	for (const [key, cell] of Object.entries(gameState.board.cells)) {
		if (cellHasKing(cell)) {
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
	
	// Orthogonal only (matching server island rules — no diagonals)
	const directions = [
		{ dx: -1, dz: 0 },
		{ dx: 1, dz: 0 },
		{ dx: 0, dz: -1 },
		{ dx: 0, dz: 1 },
	];

	while (queue.length > 0) {
		const { x, z, path } = queue.shift();

		// Check if we've reached the king
		if (x === kingX && z === kingZ) {
			return path;
		}

		// Try orthogonal directions
		for (const { dx, dz } of directions) {
			const newX = x + dx;
			const newZ = z + dz;
			const key = `${newX},${newZ}`;

			// Skip if already visited
			if (visited.has(key)) {
				continue;
			}

			// Skip if cell is empty or not owned territory
			const cell = gameState.board.cells[key];
			if (!cellIsOwnedTerritory(cell) && !(newX === kingX && newZ === kingZ)) {
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

// NOTE: `updatePathVisualization` / `highlightPathToKing` are defined later in this file.
// We keep a single export of each to avoid ES module "Identifier has already been declared" errors.

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
	const scene = getScene();
	if (!THREE || !scene) return;

	const board = gameState.board;
	const minX = board?.minX ?? 0;
	const maxX = board?.maxX ?? 15;
	const width = maxX - minX + 1;
	const centreX = minX + width / 2;

	rowIndices.forEach(rowIndex => {
		const geometry = new THREE.PlaneGeometry(width, 0.9);
		const material = new THREE.MeshBasicMaterial({
			color: 0x00ffff,
			transparent: true,
			opacity: 0.4,
			side: THREE.DoubleSide,
			depthWrite: false,
		});
		const highlight = new THREE.Mesh(geometry, material);
		highlight.position.set(centreX, 0.12, rowIndex);
		highlight.rotation.x = -Math.PI / 2;
		scene.add(highlight);

		const startTime = Date.now();
		const duration = 600;
		const tick = () => {
			const elapsed = Date.now() - startTime;
			if (elapsed < duration) {
				material.opacity = 0.4 * (1 - elapsed / duration);
				requestAnimationFrame(tick);
			} else {
				scene.remove(highlight);
				geometry.dispose();
				material.dispose();
			}
		};
		tick();
	});
}

/**
 * Handle tetrominoFailed event from server
 * @param {Object} data - Data about the failure
 */
function handleTetrominoFailed(data) {
	console.log('Tetromino placement failed:', data);

	let failureMessage = data?.message || 'Placement failed - tetromino exploded.';
	let failureEffect = FAILURE_EFFECTS.EXPLODE;
	if (typeof failureMessage === 'string' && failureMessage.toLowerCase().includes('connect')) {
		failureMessage = 'Missed connection - tetromino dissolved into sand.';
		failureEffect = FAILURE_EFFECTS.DISSOLVE_FALL;
	}

	if (gameState.currentTetromino) {
		const posX = gameState.currentTetromino.position.x;
		const posZ = gameState.currentTetromino.position.z;
		processExplosion(posX, posZ, failureMessage, failureEffect);
	} else if (typeof window.showToastMessage === 'function') {
		window.showToastMessage(failureMessage, 'error');
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
let _pathVizLastPos = null;
let _pathVizLastTime = 0;
const PATH_VIZ_THROTTLE_MS = 250;

export function updatePathVisualization(gameState) {
	if (!gameState || !gameState.currentTetromino || !gameState.currentPlayer) {
		highlightPathToKing(gameState, null);
		return;
	}

	const tetromino = gameState.currentTetromino;
	const shape = tetromino.shape;
	const posX = Math.round(tetromino.position.x);
	const posZ = Math.round(tetromino.position.z);

	const posKey = `${posX},${posZ}`;
	const now = performance.now();
	if (posKey === _pathVizLastPos && now - _pathVizLastTime < PATH_VIZ_THROTTLE_MS) {
		return;
	}
	_pathVizLastPos = posKey;
	_pathVizLastTime = now;

	const srcCells = gameState.board?.cells || {};
	const simulatedCells = {};
	for (const key of Object.keys(srcCells)) {
		simulatedCells[key] = srcCells[key];
	}

	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const key = `${posX + x},${posZ + z}`;
				simulatedCells[key] = {
					type: 'tetromino',
					player: gameState.currentPlayer
				};
			}
		}
	}

	const simulatedBoard = { ...gameState.board, cells: simulatedCells };
	let bestPath = null;

	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const tempGameState = { ...gameState, board: simulatedBoard };
				const path = hasPathToKing(tempGameState, posX + x, posZ + z, gameState.currentPlayer);
				if (path && (!bestPath || path.length < bestPath.length)) {
					bestPath = path;
				}
			}
		}
	}

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
export function highlightPathToKing(gameState, path, color = 0x00ccff) {
	if (!gameState) return;
	const THREE = getTHREE();

	if (gameState.pathHighlights) {
		gameState.pathHighlights.forEach(highlight => {
			if (gameState.scene) gameState.scene.remove(highlight);
			if (highlight.geometry) highlight.geometry.dispose();
			if (highlight.material) highlight.material.dispose();
		});
	}

	gameState.pathHighlights = [];

	if (!path || path.length === 0 || !gameState.scene) {
		return;
	}

	const highlightMaterial = new THREE.MeshBasicMaterial({
		color: color,
		transparent: true,
		opacity: 0.25,
		side: THREE.DoubleSide,
		depthWrite: false,
	});

	path.forEach(([x, z]) => {
		const geometry = new THREE.PlaneGeometry(0.9, 0.9);
		geometry.rotateX(-Math.PI / 2);
		const highlight = new THREE.Mesh(geometry, highlightMaterial);
		highlight.position.set(x + 0.5, 0.12, z + 0.5);
		highlight.renderOrder = 1;
		gameState.scene.add(highlight);
		gameState.pathHighlights.push(highlight);
	});
}
