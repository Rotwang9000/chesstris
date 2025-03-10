/**
 * Renderer Core Module
 * Contains core functionality for the renderer
 */

import * as THREE from '../../utils/three.js';
import { OrbitControls } from '../../utils/OrbitControls.js';
import { FogExp2 } from '../../utils/three.js';
import { Constants } from '../../config/constants.js';
import { GameState } from '../../game/gameState.js';
import { SessionManager } from '../../session/sessionManager.js';
import { canPlayerMakeChessMoves } from './utils.js';
import { createSkybox, addClouds, animatePotionsAndParticles } from './effects.js';
import { updatePlayerLabels } from './pieces.js';

// Shared variables
let container;
let scene;
let camera;
let renderer;
let controls;
let boardGroup;
let piecesGroup;
let tetrominoGroup;
let ghostGroup;
let uiGroup;
let decorationsGroup;
let materials = {};
let lastTime = 0;

/**
 * Initializes the renderer
 * @param {HTMLElement} containerElement - The container to render into
 * @param {Object} options - Renderer options
 */
export function init(containerElement, options = {}) {
	try {
		console.log('Initializing renderer...');
		container = containerElement;
		
		// Create scene
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x121212);
		
		// Create camera
		const aspect = container.clientWidth / container.clientHeight;
		camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
		camera.position.set(12, 15, 20);
		camera.lookAt(12, 0, 12);
		
		// Create renderer
		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(container.clientWidth, container.clientHeight);
		renderer.setPixelRatio(window.devicePixelRatio);
		container.appendChild(renderer.domElement);
		
		// Add orbit controls
		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		
		// Create groups for organization
		boardGroup = new THREE.Group();
		piecesGroup = new THREE.Group();
		tetrominoGroup = new THREE.Group();
		uiGroup = new THREE.Group();
		decorationsGroup = new THREE.Group();
		ghostGroup = new THREE.Group();
		
		scene.add(boardGroup);
		scene.add(piecesGroup);
		scene.add(tetrominoGroup);
		scene.add(ghostGroup);
		scene.add(uiGroup);
		scene.add(decorationsGroup);
		
		// Load textures
		loadTextures();
		
		// Add lighting
		addLights();
		
		// Add skybox
		createSkybox(scene);
		
		// Add clouds
		addClouds(scene);
		
		// Initialize session
		const sessionData = SessionManager.getSessionData();
		console.log('Session initialized:', sessionData);
		
		// Initialize default game state for rendering
		console.log('Initializing default game state for rendering');
		GameState.initGameState();
		
		// Create a new game world with the current player
		if (sessionData && sessionData.playerId) {
			initializeGameWorld(sessionData.playerId, sessionData.username);
		}
		
		// Add window resize handler
		window.addEventListener('resize', onWindowResize);
		
		// Start animation loop
		animate();
		
		console.log('Renderer initialized successfully');
		return true;
	} catch (error) {
		console.error('Error initializing renderer:', error);
		return false;
	}
}

/**
 * Adds lights to the scene
 */
function addLights() {
	// Ambient light for overall illumination
	const ambientLight = new THREE.AmbientLight(0xd6f5ff, 0.5);
	scene.add(ambientLight);
	
	// Main directional light (sun)
	const sunLight = new THREE.DirectionalLight(0xffffeb, 1.0);
	sunLight.position.set(50, 100, 50);
	sunLight.castShadow = true;
	
	// Adjust shadow properties
	sunLight.shadow.mapSize.width = 2048;
	sunLight.shadow.mapSize.height = 2048;
	sunLight.shadow.camera.near = 0.5;
	sunLight.shadow.camera.far = 500;
	scene.add(sunLight);
	
	// Fill light from opposite direction
	const fillLight = new THREE.DirectionalLight(0x8cb8ff, 0.4);
	fillLight.position.set(-50, 50, -50);
	scene.add(fillLight);
	
	// Add a point light for some local illumination
	const bounceLight = new THREE.PointLight(0x3f88c5, 0.3, 50);
	bounceLight.position.set(10, 5, 10);
	scene.add(bounceLight);
	
	// Add fog for depth
	scene.fog = new FogExp2(0xd1e9ff, 0.008);
}

/**
 * Loads textures for the renderer
 */
function loadTextures() {
	try {
		const textureLoader = new THREE.TextureLoader();
		const loadedTextures = {}; // Object to store loaded textures
		
		// Create a default fallback texture
		const defaultTexture = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
		
		// Helper function to load a texture with fallback
		const loadTextureWithFallback = (url, fallbackColor = 0xCCCCCC) => {
			return new Promise((resolve) => {
				textureLoader.load(
					url,
					(texture) => {
						console.log(`Loaded texture: ${url}`);
						resolve(new THREE.MeshBasicMaterial({ map: texture }));
					},
					undefined, // onProgress not used
					(error) => {
						console.warn(`Failed to load texture: ${url}`, error);
						const fallbackMaterial = new THREE.MeshBasicMaterial({ color: fallbackColor });
						resolve(fallbackMaterial);
					}
				);
			});
		};
		
		// Load all required textures
		// Using Promise.all to wait for all textures to load
		Promise.all([
			loadTextureWithFallback('textures/board.png', 0x8B4513),
			loadTextureWithFallback('textures/cell.png', 0xAAAAAA),
			loadTextureWithFallback('textures/home_zone.png', 0x3366CC)
		]).then(([boardMat, cellMat, homeZoneMat]) => {
			// Store textures in the materials object
			loadedTextures.board = boardMat;
			loadedTextures.cell = cellMat;
			loadedTextures.homeZone = homeZoneMat;
			
			// Signal that textures are loaded
			console.log('All textures loaded');
			
			// Update the global materials object properties individually
			// instead of reassigning the whole object
			if (typeof materials === 'object') {
				Object.assign(materials, loadedTextures);
			} else {
				// If materials isn't defined yet, create a new object
				window.materials = loadedTextures;
			}
		}).catch(error => {
			console.error('Error loading textures:', error);
			
			// Set fallback materials
			const fallbackMaterials = {
				board: new THREE.MeshBasicMaterial({ color: 0x8B4513 }),
				cell: new THREE.MeshBasicMaterial({ color: 0xAAAAAA }),
				homeZone: new THREE.MeshBasicMaterial({ color: 0x3366CC })
			};
			
			// Signal that textures are loaded
			console.log('Using fallback textures');
			
			// Update the global materials object properties individually
			if (typeof materials === 'object') {
				Object.assign(materials, fallbackMaterials);
			} else {
				// If materials isn't defined yet, create a new object
				window.materials = fallbackMaterials;
			}
		});
	} catch (error) {
		console.error('Error in loadTextures:', error);
		
		// Create basic materials as fallback
		const fallbackMaterials = {
			board: new THREE.MeshBasicMaterial({ color: 0x8B4513 }),
			cell: new THREE.MeshBasicMaterial({ color: 0xAAAAAA }),
			homeZone: new THREE.MeshBasicMaterial({ color: 0x3366CC })
		};
		
		// Update the global materials object properties individually
		if (typeof materials === 'object') {
			Object.assign(materials, fallbackMaterials);
		} else {
			// If materials isn't defined yet, create a new object
			window.materials = fallbackMaterials;
		}
	}
}

/**
 * Handles window resize events
 */
function onWindowResize() {
	if (!container || !camera || !renderer) return;
	
	// Update camera aspect ratio
	camera.aspect = container.clientWidth / container.clientHeight;
	camera.updateProjectionMatrix();
	
	// Update renderer size
	renderer.setSize(container.clientWidth, container.clientHeight);
}

/**
 * Animation loop
 * @param {number} time - Current time in milliseconds
 */
function animate(time = 0) {
	// Request next frame
	requestAnimationFrame(animate);
	
	// Calculate delta time in seconds
	const deltaTime = (time - lastTime) / 1000;
	lastTime = time;
	
	// Update controls
	if (controls) {
		controls.update();
	}
	
	// Update scene
	updateScene(deltaTime);
	
	// Render scene
	if (renderer && scene && camera) {
		renderer.render(scene, camera);
	}
}

/**
 * Updates the scene
 * @param {number} deltaTime - Time elapsed since last frame in seconds
 */
function updateScene(deltaTime) {
	try {
		// Get current game state
		const gameState = GameState.getGameState();
		
		// Update board
		if (window.boardModule && gameState) {
			window.boardModule.updateBoard(gameState, new THREE.BoxGeometry(1, 0.2, 1));
		}
		
		// Update chess pieces
		if (window.piecesModule && gameState) {
			window.piecesModule.updateChessPieces(gameState);
		}
		
		// Update player labels
		if (window.piecesModule && camera) {
			window.piecesModule.updatePlayerLabels(camera);
		}
		
		// Update falling tetromino
		if (window.tetrominoModule && gameState) {
			window.tetrominoModule.updateFallingTetromino(gameState);
		}
		
		// Update ghost piece
		if (window.tetrominoModule && gameState) {
			window.tetrominoModule.updateGhostPiece(gameState);
		}
		
		// Animate potions and particles
		animatePotionsAndParticles(deltaTime);
		
		// Update UI
		updateUI();
	} catch (error) {
		console.error('Error updating scene:', error);
	}
}

/**
 * Updates the UI elements
 */
function updateUI() {
	try {
		// Get session data
		const sessionData = SessionManager.getSessionData();
		
		// Get game state
		const gameState = GameState.getGameState();
		
		// Check if player can make chess moves
		if (!canPlayerMakeChessMoves(gameState, sessionData)) {
			// Show message that player cannot make chess moves yet
			// This would be implemented with UI elements
		}
	} catch (error) {
		console.error('Error updating UI:', error);
	}
}

/**
 * Initializes a new game world with the first player
 * @param {string} playerId - ID of the player
 * @param {string} username - Username of the player
 */
function initializeGameWorld(playerId, username) {
	try {
		// Generate a unique color for the player based on their ID
		const hash = playerId.split('').reduce((acc, char) => {
			return char.charCodeAt(0) + ((acc << 5) - acc);
		}, 0);
		
		const hue = (Math.abs(hash) % 360) / 360;
		const playerColor = new THREE.Color().setHSL(hue, 0.8, 0.5);
		
		// Create a player object
		const player = {
			id: playerId,
			username: username,
			color: playerColor.getHex()
		};
		
		// Add player to game state
		const gameState = GameState.getGameState();
		if (!gameState.players) {
			gameState.players = {};
		}
		gameState.players[playerId] = player;
		
		// Create home zone for the player
		createPlayerHomeZone(playerId);
		
		console.log(`Initialized game world with player: ${playerId}`);
	} catch (error) {
		console.error('Error initializing game world:', error);
	}
}

/**
 * Creates a home zone for a player
 * @param {string} playerId - ID of the player
 */
function createPlayerHomeZone(playerId) {
	try {
		const gameState = GameState.getGameState();
		if (!gameState || !gameState.players || !gameState.players[playerId]) {
			console.error(`Cannot create home zone: Player ${playerId} not found`);
			return;
		}
		
		// Find a free spot for the home zone
		const homeZoneSpot = findFreeHomeZoneSpot(gameState);
		if (!homeZoneSpot) {
			console.error('No free spot found for home zone');
			return;
		}
		
		// Create new homeZone with 8x2 dimensions
		const homeZoneWidth = 8;
		const homeZoneHeight = 2;
		
		// Get player color
		const playerColor = gameState.players[playerId].color;
		
		// Create cells for the home zone
		for (let z = homeZoneSpot.z; z < homeZoneSpot.z + homeZoneHeight; z++) {
			for (let x = homeZoneSpot.x; x < homeZoneSpot.x + homeZoneWidth; x++) {
				// Ensure the board array is initialized
				if (!gameState.board[z]) {
					gameState.board[z] = [];
				}
				
				// Create a cell for the home zone
				gameState.board[z][x] = {
					playerId: playerId,
					color: playerColor,
					isHomeZone: true,
					chessPiece: null
				};
				
				// Add chess pieces to the home zone
				if (z === homeZoneSpot.z) {
					// Back row: rook, knight, bishop, queen, king, bishop, knight, rook
					let pieceType;
					switch (x - homeZoneSpot.x) {
						case 0: pieceType = 'rook'; break;
						case 1: pieceType = 'knight'; break;
						case 2: pieceType = 'bishop'; break;
						case 3: pieceType = 'queen'; break;
						case 4: pieceType = 'king'; break;
						case 5: pieceType = 'bishop'; break;
						case 6: pieceType = 'knight'; break;
						case 7: pieceType = 'rook'; break;
					}
					
					gameState.board[z][x].chessPiece = {
						type: pieceType,
						player: playerId
					};
				} else if (z === homeZoneSpot.z + 1) {
					// Front row: all pawns
					gameState.board[z][x].chessPiece = {
						type: 'pawn',
						player: playerId
					};
				}
			}
		}
	} catch (error) {
		console.error('Error creating player home zone:', error);
	}
}

/**
 * Finds a free spot for a new player's home zone
 * @param {Object} gameState - The current game state
 * @returns {Object} Position and size for the new home zone
 */
function findFreeHomeZoneSpot(gameState) {
	// Default to a position near the center for the first player
	if (!gameState.players || Object.keys(gameState.players).length <= 1) {
		return { x: 8, z: 20 };
	}
	
	// For subsequent players, find a spot that doesn't overlap with existing home zones
	// This is a simplified implementation - in a real game, you'd want more sophisticated placement
	const homeZoneWidth = 8;
	const homeZoneHeight = 2;
	const boardSize = gameState.board.length;
	
	// Try different positions
	const possiblePositions = [
		{ x: 8, z: 2 },    // Top
		{ x: 2, z: 8 },    // Left
		{ x: 14, z: 8 },   // Right
		{ x: 8, z: 14 }    // Bottom
	];
	
	for (const pos of possiblePositions) {
		let isOverlapping = false;
		
		// Check if this position overlaps with any existing cells
		for (let z = pos.z; z < pos.z + homeZoneHeight; z++) {
			for (let x = pos.x; x < pos.x + homeZoneWidth; x++) {
				if (z >= boardSize || x >= boardSize) {
					isOverlapping = true;
					break;
				}
				
				if (gameState.board[z] && gameState.board[z][x]) {
					isOverlapping = true;
					break;
				}
			}
			if (isOverlapping) break;
		}
		
		if (!isOverlapping) {
			return pos;
		}
	}
	
	// If all predefined positions are taken, return null
	// In a real game, you'd expand the board or find another solution
	return null;
}

/**
 * Cleans up the renderer
 */
export function cleanup() {
	try {
		// Remove event listeners
		window.removeEventListener('resize', onWindowResize);
		
		// Dispose of geometries and materials
		scene.traverse(object => {
			if (object.geometry) {
				object.geometry.dispose();
			}
			
			if (object.material) {
				if (Array.isArray(object.material)) {
					object.material.forEach(material => material.dispose());
				} else {
					object.material.dispose();
				}
			}
		});
		
		// Dispose of renderer
		if (renderer) {
			renderer.dispose();
		}
		
		// Remove renderer from DOM
		if (container && renderer) {
			container.removeChild(renderer.domElement);
		}
		
		// Clear references
		scene = null;
		camera = null;
		renderer = null;
		controls = null;
		boardGroup = null;
		piecesGroup = null;
		tetrominoGroup = null;
		uiGroup = null;
		
		console.log('Renderer cleaned up');
	} catch (error) {
		console.error('Error cleaning up renderer:', error);
	}
}

// Export default object with all functions
export default {
	init,
	cleanup,
	animate,
	updateScene,
	initializeGameWorld,
	createPlayerHomeZone,
	findFreeHomeZoneSpot
};
