/**
 * Renderer Tetromino Module
 * Contains functions for rendering Tetris pieces with physics
 * 
 * This module focuses on the visual representation and physics of tetrominos,
 * while the core/tetrominoManager.js handles the game logic.
 */

import * as THREE from 'three';
import { Constants } from '../../config/constants.js';
import { getFloatingHeight } from './utils.js';
import * as TetrominoManager from '../../core/tetrominoManager.js';

// Shared variables
let tetrominoGroup;
let ghostGroup;
let activeTetromino = null;
let isSimulationActive = false;
let lastPhysicsUpdate = 0;
let fallingSpeed = 0.5; // Increased from 0.1 to 0.5 - Units per second
let fallAcceleration = 0.05; // Increased from 0.01 to 0.05 - Increase in speed per second
let currentVelocity = { x: 0, y: -fallingSpeed, z: 0 };
let bounceFactor = 0.3; // Reduced bounce factor for more controlled behavior
let dissolvingTetrominos = []; // Track dissolving tetrominos

// Physics constants
const GRAVITY = 0.02; // Increased from 0.008 to 0.02 - Reduced gravity for better control
const GROUND_Y = 0.5; // Y position of the ground/board surface
const MIN_VELOCITY = 0.01; // Minimum velocity for movement
const ROTATION_DAMPING = 0.95; // Rotation damping factor
const COLLISION_THRESHOLD = 0.1; // Minimum distance for collision detection
const STICK_DISTANCE = 0.2; // Distance threshold for sticking to adjacent cells
const GRID_SNAP_THRESHOLD = 0.2; // Threshold for snapping to grid
const MOVE_SPEED = 0.2; // Increased from 0.05 to 0.2 - Speed for controlled movement
const DISSOLUTION_SPEED = 0.03; // Speed of tetromino dissolution

/**
 * Initialize the tetromino module
 * @param {THREE.Group} tetroGroup - The group to add tetromino pieces to
 * @param {THREE.Group} ghostGrp - The group to add ghost pieces to
 */
export function init(tetroGroup, ghostGrp) {
	tetrominoGroup = tetroGroup;
	ghostGroup = ghostGrp;
	
	// Start the physics simulation loop
	startPhysicsSimulation();
	
	console.log('Tetromino renderer initialized');
}

/**
 * Start the physics simulation
 */
function startPhysicsSimulation() {
	if (isSimulationActive) return;
	isSimulationActive = true;
	lastPhysicsUpdate = performance.now();
	simulatePhysics();
}

/**
 * Stop the physics simulation
 */
function stopPhysicsSimulation() {
	isSimulationActive = false;
}

/**
 * Simulate physics for tetromino pieces
 */
function simulatePhysics() {
	if (!isSimulationActive) return;
	
	const currentTime = performance.now();
	const deltaTime = (currentTime - lastPhysicsUpdate) / 1000; // Convert to seconds
	lastPhysicsUpdate = currentTime;
	
	// Skip if delta time is too large (tab was inactive)
	if (deltaTime > 0.1) {
		requestAnimationFrame(simulatePhysics);
		return;
	}
	
	try {
		// Update dissolving tetrominos
		updateDissolvingTetrominos(deltaTime);
		
		// Only simulate if we have an active tetromino
		if (activeTetromino && tetrominoGroup) {
			// Apply gravity to velocity
			currentVelocity.y -= GRAVITY * deltaTime;
			
			// Calculate potential new position
			const newPosition = {
				x: activeTetromino.position.x + currentVelocity.x * deltaTime,
				y: activeTetromino.position.y + currentVelocity.y * deltaTime,
				z: activeTetromino.position.z + currentVelocity.z * deltaTime
			};
			
			// Get the board from the game state
			const board = window.GameState ? window.GameState.getBoard() : null;
			
			// Detect collision with the board
			const collisionResult = detectBoardCollision(newPosition, activeTetromino.userData, board);
			
			if (collisionResult.collision) {
				// Handle collision
				if (collisionResult.shouldStick) {
					// Tetromino should stick to the board
					handleTetrominoStick(activeTetromino, collisionResult);
				} else {
					// Bounce off the board
					handleBounce(collisionResult.normal);
					
					// Apply bounce to position
					activeTetromino.position.x += currentVelocity.x * deltaTime;
					activeTetromino.position.y += currentVelocity.y * deltaTime;
					activeTetromino.position.z += currentVelocity.z * deltaTime;
				}
			} else {
				// No collision, update position
				activeTetromino.position.x = newPosition.x;
				activeTetromino.position.y = newPosition.y;
				activeTetromino.position.z = newPosition.z;
				
				// Apply rotation damping
				if (activeTetromino.rotation.x) activeTetromino.rotation.x *= ROTATION_DAMPING;
				if (activeTetromino.rotation.z) activeTetromino.rotation.z *= ROTATION_DAMPING;
				
				// Check if we should snap to grid
				snapToGridIfNeeded();
				
				// If the tetromino falls below a certain threshold, reset it
				if (activeTetromino.position.y < -10) {
					console.log('Tetromino fell off the board, resetting...');
					resetTetromino();
				}
			}
			
			// Update ghost piece
			if (board) {
				updateGhostForActiveTetromino(board);
			}
		}
	} catch (error) {
		console.error('Error in physics simulation:', error);
	}
	
	// Continue the simulation loop
	requestAnimationFrame(simulatePhysics);
}

/**
 * Snap tetromino to grid if it's moving slowly
 */
function snapToGridIfNeeded() {
	if (!activeTetromino) return;
	
	// Only snap if moving slowly
	if (Math.abs(currentVelocity.x) < GRID_SNAP_THRESHOLD && 
		Math.abs(currentVelocity.z) < GRID_SNAP_THRESHOLD) {
		// Round position to nearest grid cell
		activeTetromino.position.x = Math.round(activeTetromino.position.x);
		activeTetromino.position.z = Math.round(activeTetromino.position.z);
	}
}

/**
 * Detect collision between tetromino and board
 */
function detectBoardCollision(position, tetrominoData, board) {
	// Check for ground collision
	if (position.y <= GROUND_Y) {
		// Check if above the board
		if (isAboveBoard(position, board)) {
			// Check if should stick (at edge) or dissolve (not at edge)
			const shouldStick = checkShouldStick(position, board);
			
			return { 
				collision: true, 
				normal: { x: 0, y: 1, z: 0 },
				shouldStick: shouldStick,
				shouldDissolve: !shouldStick
			};
		}
		
		// Just ground collision
		return { 
			collision: true, 
			normal: { x: 0, y: 1, z: 0 },
			shouldStick: false,
			shouldDissolve: false
		};
	}
	
	return { collision: false };
}

/**
 * Check if position is above an active board cell
 */
function isAboveBoard(position, board) {
	if (!board) return false;
	
	// Convert to board coordinates
	const boardX = Math.floor(position.x);
	const boardZ = Math.floor(position.z);
	
	// Check if within bounds
	if (boardX < 0 || boardX >= board.length || boardZ < 0 || boardZ >= board[0].length) {
		return false;
	}
	
	// Check if there's an active cell at this position
	return board[boardZ][boardX] && board[boardZ][boardX].active;
}

/**
 * Check if tetromino should stick to the board
 */
function checkShouldStick(position, board) {
	if (!board) return false;
	
	// Convert to board coordinates
	const boardX = Math.floor(position.x);
	const boardZ = Math.floor(position.z);
	
	// Check if at the edge of the board
	if (boardX <= 0 || boardX >= board.length - 1 || 
		boardZ <= 0 || boardZ >= board[0].length - 1) {
		return true;
	}
	
	// Check adjacent cells
	const directions = [
		{ x: 1, z: 0 },
		{ x: -1, z: 0 },
		{ x: 0, z: 1 },
		{ x: 0, z: -1 }
	];
	
	// Check if any adjacent cell is occupied
	for (const dir of directions) {
		const checkX = boardX + dir.x;
		const checkZ = boardZ + dir.z;
		
		// Check bounds
		if (checkX >= 0 && checkX < board.length && 
			checkZ >= 0 && checkZ < board[0].length) {
			// Check if occupied
			if (board[checkZ][checkX] && board[checkZ][checkX].active) {
				// Check if this is an edge cell
				if (isEdgeCell(checkX, checkZ, board)) {
					return true;
				}
			}
		}
	}
	
	// Special case for home zone
	return board[boardZ] && board[boardZ][boardX] && board[boardZ][boardX].isHomeZone;
}

/**
 * Check if a cell is at the edge of the board
 */
function isEdgeCell(x, z, board) {
	if (!board) return false;
	
	// Check if at board edge
	if (x <= 0 || x >= board.length - 1 || z <= 0 || z >= board[0].length - 1) {
		return true;
	}
	
	// Check if any adjacent cell is empty
	const directions = [
		{ x: 1, z: 0 },
		{ x: -1, z: 0 },
		{ x: 0, z: 1 },
		{ x: 0, z: -1 }
	];
	
	for (const dir of directions) {
		const checkX = x + dir.x;
		const checkZ = z + dir.z;
		
		// Check bounds
		if (checkX >= 0 && checkX < board.length && 
			checkZ >= 0 && checkZ < board[0].length) {
			// If adjacent cell is empty, this is an edge
			if (!board[checkZ][checkX] || !board[checkZ][checkX].active) {
				return true;
			}
		}
	}
	
	return false;
}

/**
 * Handle bouncing when colliding
 */
function handleBounce(normal) {
	// Bounce with reduced energy based on the normal
	if (normal.x !== 0) {
		currentVelocity.x = -currentVelocity.x * bounceFactor;
	}
	
	if (normal.y !== 0) {
		currentVelocity.y = -currentVelocity.y * bounceFactor;
	}
	
	if (normal.z !== 0) {
		currentVelocity.z = -currentVelocity.z * bounceFactor;
	}
	
	// No random rotation on bounce - pieces should stay aligned
	
	// If velocity is too low, zero it out
	if (Math.abs(currentVelocity.x) < MIN_VELOCITY) currentVelocity.x = 0;
	if (Math.abs(currentVelocity.y) < MIN_VELOCITY) currentVelocity.y = 0;
	if (Math.abs(currentVelocity.z) < MIN_VELOCITY) currentVelocity.z = 0;
}

/**
 * Start dissolving a tetromino
 */
function startDissolveTetromino(tetromino) {
	if (!tetromino) return;
	
	console.log('Starting tetromino dissolution');
	
	// Mark as dissolving
	tetromino.userData.dissolving = true;
	tetromino.userData.dissolveProgress = 0;
	
	// Make sure materials are transparent
	tetromino.traverse((child) => {
		if (child.material) {
			if (Array.isArray(child.material)) {
				child.material.forEach(material => {
					material.transparent = true;
				});
			} else {
				child.material.transparent = true;
			}
		}
	});
	
	// Add to dissolving array
	dissolvingTetrominos.push(tetromino);
}

/**
 * Update dissolving tetrominos
 */
function updateDissolvingTetrominos(deltaTime) {
	// Process each dissolving tetromino
	for (let i = dissolvingTetrominos.length - 1; i >= 0; i--) {
		const tetromino = dissolvingTetrominos[i];
		
		// Increment dissolve progress
		tetromino.userData.dissolveProgress += DISSOLUTION_SPEED;
		
		// Update opacity and scale
		tetromino.traverse((child) => {
			if (child.material) {
				if (Array.isArray(child.material)) {
					child.material.forEach(material => {
						material.opacity = 1 - tetromino.userData.dissolveProgress;
					});
				} else {
					child.material.opacity = 1 - tetromino.userData.dissolveProgress;
				}
			}
			
			// Add falling/shrinking effect
			if (child.isMesh) {
				child.position.y -= 0.03;
				child.scale.multiplyScalar(0.97);
			}
		});
		
		// Remove if fully dissolved
		if (tetromino.userData.dissolveProgress >= 1) {
			// Remove from scene
			if (tetromino.parent) {
				tetromino.parent.remove(tetromino);
			}
			dissolvingTetrominos.splice(i, 1);
		}
	}
}

/**
 * Schedule respawn of a new tetromino
 */
function scheduleRespawn() {
	// Spawn a new tetromino after delay
	setTimeout(() => {
		// Use the TetrominoManager to spawn a new piece
		TetrominoManager.spawnTetromino();
	}, 2000);
}

/**
 * Handle a tetromino sticking to the board
 * @param {THREE.Group} tetromino - The tetromino group
 * @param {Object} collisionResult - The collision result
 */
function handleTetrominoStick(tetromino, collisionResult) {
	// Lock the tetromino in place
	currentVelocity = { x: 0, y: 0, z: 0 };
	
	// Align the tetromino to the grid
	const gridX = Math.round(tetromino.position.x);
	const gridZ = Math.round(tetromino.position.z);
	tetromino.position.x = gridX;
	tetromino.position.z = gridZ;
	tetromino.position.y = GROUND_Y + 0.25; // Position slightly above the board
	
	// Reset rotation to align with grid
	tetromino.rotation.x = 0;
	tetromino.rotation.y = 0;
	tetromino.rotation.z = 0;
	
	// Notify the game that a piece has been placed
	if (window.GameState && typeof window.GameState.placeTetromino === 'function') {
		// Extract the tetromino data needed by the game
		const tetrominoData = {
			shape: tetromino.userData.shape,
			position: {
				x: gridX,
				y: GROUND_Y,
				z: gridZ
			},
			playerId: tetromino.userData.playerId,
			type: tetromino.userData.type
		};
		
		// Call the game's place tetromino function
		window.GameState.placeTetromino(tetrominoData);
		
		console.log('Tetromino placed at position:', gridX, GROUND_Y, gridZ);
	} else {
		console.warn('GameState.placeTetromino function not available');
	}
	
	// Clear the active tetromino reference
	activeTetromino = null;
	
	// Spawn a new tetromino after a delay
	setTimeout(() => {
		resetTetromino();
	}, 500);
}

/**
 * Reset the active tetromino and create a new one
 */
function resetTetromino() {
	// Clear the active tetromino
	activeTetromino = null;
	
	// Reset velocity
	currentVelocity = { x: 0, y: -fallingSpeed, z: 0 };
	
	// Clear the ghost piece
	clearGhostPiece();
	
	// Request a new tetromino from the game manager
	if (window.GameManager && typeof window.GameManager.spawnNewTetromino === 'function') {
		window.GameManager.spawnNewTetromino();
	} else if (TetrominoManager && typeof TetrominoManager.spawnTetromino === 'function') {
		TetrominoManager.spawnTetromino();
	} else {
		console.warn('No tetromino spawning function available');
		// Fallback: Get a new tetromino from the game state if available
	updateFallingTetromino(window.GameState ? window.GameState.getGameState() : null);
	}
}

/**
 * Update the ghost piece to show where the active tetromino would land
 * @param {Array} board - The game board
 */
function updateGhostForActiveTetromino(board) {
	if (!activeTetromino || !ghostGroup || !board) {
		clearGhostPiece();
		return;
	}
	
	// Clear existing ghost
	clearGhostPiece();
	
	// Create a new ghost group
	const ghostPiece = new THREE.Group();
	
	// Get tetromino data
	const tetrominoData = activeTetromino.userData;
	
	// Calculate landing position
	const landingPosition = calculateLandingPosition(
		activeTetromino.position.x,
		activeTetromino.position.z,
		tetrominoData,
		board
	);
	
	// Clone the tetromino geometry for the ghost
	activeTetromino.children.forEach(child => {
		// Clone the child mesh
		const ghostBlock = child.clone();
		
		// Make the ghost more transparent and flat
		if (ghostBlock.material) {
			const ghostMaterial = ghostBlock.material.clone();
			ghostMaterial.transparent = true;
			ghostMaterial.opacity = 0.3;
			ghostMaterial.wireframe = true;
			ghostBlock.material = ghostMaterial;
		}
		
		// Flatten the ghost piece on the y-axis
		ghostBlock.scale.y = 0.1;
		
		// Add to the ghost group
		ghostPiece.add(ghostBlock);
	});
	
	// Position the ghost at the landing position
	ghostPiece.position.set(
		landingPosition.x,
		landingPosition.y + 0.1, // Slightly above the ground to avoid z-fighting
		landingPosition.z
	);
	
	// Zero out ghost rotation
	ghostPiece.rotation.x = 0;
	ghostPiece.rotation.z = 0;
	
	// Add the ghost to the scene
	ghostGroup.add(ghostPiece);
}

/**
 * Calculate where the tetromino would land from current position
 * @param {number} startX - The starting X position
 * @param {number} startZ - The starting Z position
 * @param {Object} tetrominoData - The tetromino data
 * @param {Array} board - The game board
 * @returns {Object} - The landing position
 */
function calculateLandingPosition(startX, startZ, tetrominoData, board) {
	// This is a simplified version - in reality, we'd need to simulate
	// the full physics to get the exact landing position
	return {
		x: Math.round(startX),
		y: GROUND_Y,
		z: Math.round(startZ)
	};
}

/**
 * Clear the ghost piece
 */
function clearGhostPiece() {
	if (!ghostGroup) return;
	
	// Remove all children from ghost group
	while (ghostGroup.children.length > 0) {
		const child = ghostGroup.children[0];
		ghostGroup.remove(child);
		if (child.geometry) child.geometry.dispose();
		if (child.material) child.material.dispose();
	}
}

/**
 * Update the falling tetromino based on the game state
 * @param {Object} gameState - The game state
 */
export function updateFallingTetromino(gameState) {
	try {
		// Clear existing tetromino
		if (tetrominoGroup) {
		while (tetrominoGroup.children.length > 0) {
				tetrominoGroup.remove(tetrominoGroup.children[0]);
			}
		}
		
		// If no game state or no falling piece, return
		if (!gameState || !gameState.fallingPiece) {
			activeTetromino = null;
			return;
		}
		
		const { fallingPiece } = gameState;
		const { shape, position, color, playerId } = fallingPiece;
		
		// Create a new tetromino group
		const tetrominoGroup3D = new THREE.Group();
		tetrominoGroup3D.userData = {
			shape,
			playerId,
			type: fallingPiece.type || 'I'
		};
		
		// Determine player color
		let playerColor = color || 0x2196F3; // Default blue
		if (playerId && gameState.players && gameState.players[playerId]) {
			const player = gameState.players[playerId];
			playerColor = player.color || playerColor;
		}
		
		// Render each block in the tetromino
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					// Calculate block position relative to tetromino center
					const localX = x - Math.floor(shape[0].length / 2);
					const localZ = y - Math.floor(shape.length / 2);
					
					// Create block geometry
					const blockGeometry = new THREE.BoxGeometry(
						Constants.CELL_SIZE * 0.9,
						Constants.CELL_SIZE * 0.9,
						Constants.CELL_SIZE * 0.9
					);
					
					// Create block material
					const blockMaterial = new THREE.MeshStandardMaterial({
						color: playerColor,
						transparent: true,
						opacity: 0.9,
						roughness: 0.3,
						metalness: 0.7
					});
					
					const blockMesh = new THREE.Mesh(blockGeometry, blockMaterial);
					blockMesh.castShadow = true;
					blockMesh.receiveShadow = true;
					
					// Position the block relative to the tetromino center
					blockMesh.position.set(localX, 0, localZ);
					
					// Add to the tetromino group
					tetrominoGroup3D.add(blockMesh);
				}
			}
		}
		
		// Position the tetromino - ensure it's at the correct height
		// Use the position from the game state, but ensure y is set correctly
		tetrominoGroup3D.position.set(
			position.x,
			position.y || 5, // Start higher up if no y position is provided
			position.z
		);
	
	// Add the tetromino group to the scene
	tetrominoGroup.add(tetrominoGroup3D);
	
	// Set as active tetromino
	activeTetromino = tetrominoGroup3D;
	
		// Reset velocity for new tetromino with a downward direction
	currentVelocity = { x: 0, y: -fallingSpeed, z: 0 };
	
	// Update ghost piece
	if (gameState.board) {
		updateGhostForActiveTetromino(gameState.board);
	}
	} catch (error) {
		console.error('Error updating falling tetromino:', error);
	}
}

/**
 * Updates the ghost piece (preview of where the tetromino will land)
 * @param {Object} gameState - The current game state
 */
export function updateGhostPiece(gameState) {
	// If we have an active tetromino, we're handling the ghost in the physics loop
	if (activeTetromino) return;
	
	try {
		// Check if ghostGroup is initialized
		if (!ghostGroup) {
			console.error('ghostGroup is not initialized');
			return;
		}
		
		// Clear existing ghost piece
		clearGhostPiece();
		
		// If no game state or ghost piece, there's nothing to do
		if (!gameState || !gameState.ghostPiece) return;
		
		// Get the ghost piece data
		const { shape, position, playerId } = gameState.ghostPiece;
		
		// Create a new group for the ghost
		const ghostGroup3D = new THREE.Group();
		
		// Get player color
		let playerColor = 0xFFFFFF; // Default white
		if (playerId && gameState.players && gameState.players[playerId]) {
			playerColor = gameState.players[playerId].color || 0xFFFFFF;
		}
		
		// Render each block in the ghost piece
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					// Calculate world position
					const worldX = position.x + x;
					const worldZ = position.z + y;
					const worldY = position.y;
					
					// Create block geometry (thin to show it's a ghost)
					const blockGeometry = new THREE.BoxGeometry(
						Constants.CELL_SIZE * 0.9,
						Constants.CELL_SIZE * 0.2,
						Constants.CELL_SIZE * 0.9
					);
					
					// Create block material - semi-transparent version of player color
					const blockMaterial = new THREE.MeshStandardMaterial({
						color: playerColor,
						transparent: true,
						opacity: 0.3,
						wireframe: true,
						roughness: 0.5,
						metalness: 0.2
					});
					
					const blockMesh = new THREE.Mesh(blockGeometry, blockMaterial);
					
					// Position the block
					blockMesh.position.set(worldX, worldY, worldZ);
					
					// Add to the ghost group
					ghostGroup3D.add(blockMesh);
				}
			}
		}
		
		// Add the ghost group to the scene
		ghostGroup.add(ghostGroup3D);
	} catch (error) {
		console.error('Error updating ghost piece:', error);
	}
}

/**
 * Update function called every frame
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function update(deltaTime) {
	try {
		// Update physics simulation
		if (isSimulationActive) {
			simulatePhysics();
			updateDissolvingTetrominos(deltaTime);
		}
	} catch (error) {
		console.error('Error in tetromino update:', error);
	}
}

/**
 * Toggle physics simulation
 * @param {boolean} enabled - Whether physics should be enabled
 */
export function togglePhysics(enabled) {
	try {
		isSimulationActive = enabled;
		console.log(`Physics simulation ${enabled ? 'enabled' : 'disabled'}`);
	} catch (error) {
		console.error('Error toggling physics:', error);
	}
}

/**
 * Respawn a tetromino
 */
function respawnTetromino() {
	// Use the TetrominoManager to spawn a new piece
	TetrominoManager.spawnTetromino();
}

// Export the module
export default {
	init,
	updateFallingTetromino,
	updateGhostPiece,
	togglePhysics,
	update
};
