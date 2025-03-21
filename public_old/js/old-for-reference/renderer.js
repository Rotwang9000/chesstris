/**
 * Renderer Module
 * 
 * Handles the rendering of the game using Three.js.
 */

import * as THREE from '../utils/three.js';
import {
	Scene,
	PerspectiveCamera,
	WebGLRenderer,
	Group,
	Object3D,
	Mesh,
	Vector3,
	Color,
	AmbientLight,
	DirectionalLight,
	PointLight,
	SpotLight,
	SphereGeometry,
	BoxGeometry,
	PlaneGeometry,
	CylinderGeometry,
	ConeGeometry,
	MeshBasicMaterial,
	MeshStandardMaterial,
	MeshLambertMaterial,
	MeshPhongMaterial,
	TextureLoader,
	Raycaster,
	DoubleSide,
	OrbitControls,
	BackSide,
	BufferAttribute,
	FogExp2
} from '../utils/three.js';

import * as GameState from '../core/gameState.js';
import * as Constants from '../core/constants.js';
import * as TetrominoManager from '../core/tetrominoManager.js';
import * as Helpers from '../utils/helpers.js';
import SessionManager from '../services/sessionManager.js';

// Three.js variables
let scene, camera, renderer, controls;
let boardGroup, piecesGroup, tetrominoGroup, uiGroup;

// Textures and materials
const textures = {};
const materials = {};

// Animation variables
let animationFrameId;
let lastRenderTime = 0;

// UI elements
let loadingBar;
let notificationElement;
let playerLabels = [];

/**
 * Initialize the renderer
 * @param {HTMLElement} container - The container element
 * @param {Object} options - Renderer options
 * @returns {Object} The renderer instance
 */
export function init(container, options = {}) {
	try {
		// Create the scene
		scene = new Scene();
		scene.background = new Color(0x121212);

		// Create the camera
		const width = container.clientWidth;
		const height = container.clientHeight;
		const aspect = width / height;
		camera = new PerspectiveCamera(60, aspect, 0.1, 1000);
		camera.position.set(0, 10, 20);

		// Create the renderer
		renderer = new WebGLRenderer({ antialias: true });
		renderer.setSize(width, height);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		container.appendChild(renderer.domElement);

		// Add orbit controls
		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.screenSpacePanning = false;
		controls.minDistance = 5;
		controls.maxDistance = 50;
		controls.maxPolarAngle = Math.PI / 2;

		window.OrbitControls = OrbitControls;

		// Create groups
		boardGroup = new Group();
		piecesGroup = new Group();
		tetrominoGroup = new Group();
		uiGroup = new Group();

		scene.add(boardGroup);
		scene.add(piecesGroup);
		scene.add(tetrominoGroup);
		scene.add(uiGroup);

		// Create skybox
		createSkybox();

		// Add lights
		addLights();

		// Load textures
		loadTextures();

		// Initialize session manager to get player info
		const session = SessionManager.initSession();
		console.log('Session initialized:', session);

		// Initialize game state if it doesn't exist
		const gameState = GameState.getGameState();
		if (!gameState || !gameState.board || !Array.isArray(gameState.board)) {
			console.log('Initializing default game state for rendering');
			// Initialize with an empty board (will be filled with null values)
			GameState.initGameState();

			// Create a new game world with the current player
			initializeGameWorld(session.playerId, session.username);
		} else {
			console.log('Using existing game state for rendering');

			// Check if player exists in the game state
			if (!gameState.players[session.playerId]) {
				// Player doesn't exist in this game, add them
				addPlayerToExistingWorld(session.playerId, session.username);
			}
		}

		// Add event listeners
		window.addEventListener('resize', onWindowResize);

		// Reset render timing
		lastRenderTime = performance.now();

		// Start the animation loop
		animate();

		console.log('Renderer initialized successfully');
		return { scene, camera, renderer };
	} catch (error) {
		console.error('Error initializing renderer:', error);
		throw error;
	}
}

/**
 * Initialize a new game world with the first player
 * @param {string} playerId - Player's unique ID
 * @param {string} username - Player's username
 */
function initializeGameWorld(playerId, username) {
	try {
		const gameState = GameState.getGameState();
		if (!gameState) return;

		// =====================================================================
		// NOTE: The code below is for development/testing visualization only.
		// In production, the actual game state should be managed server-side,
		// and the client should only be responsible for rendering it.
		// =====================================================================

		// Reset the game state to empty
		gameState.board = [];
		gameState.players = {};

		// Create a 24x24 board (standard size)
		const boardSize = 24;
		for (let z = 0; z < boardSize; z++) {
			gameState.board[z] = [];
			for (let x = 0; x < boardSize; x++) {
				gameState.board[z][x] = null;
			}
		}

		// Generate a unique color for the player
		const hue = Math.random();
		const playerColor = new Color().setHSL(hue, 0.8, 0.5);
		const colorHex = playerColor.getHex();

		// Set up home zone position - player starts at the bottom center
		const homeZoneWidth = 8;  // Standard chess width
		const homeZoneHeight = 2; // Standard chess height
		const startX = Math.floor((boardSize - homeZoneWidth) / 2); // Center horizontally
		const startZ = boardSize - homeZoneHeight - 2; // Near bottom of board

		// Add player to the game state
		gameState.players[playerId] = {
			id: playerId,
			name: username,
			color: colorHex,
			homeZone: {
				x: startX,
				z: startZ,
				width: homeZoneWidth,
				height: homeZoneHeight
			}
		};

		// Create home zone cells
		for (let dz = 0; dz < homeZoneHeight; dz++) {
			for (let dx = 0; dx < homeZoneWidth; dx++) {
				const cellX = startX + dx;
				const cellZ = startZ + dz;

				gameState.board[cellZ][cellX] = {
					type: 'home_zone',
					player: playerId,
					chessPiece: null
				};
			}
		}

		// Add chess pieces in standard chess board arrangement
		// This is only for visualization - in production, piece positions
		// should be determined by the server based on game rules

		// Back row (major pieces)
		const backRowPieces = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
		// Front row (pawns)
		const frontRowPieces = Array(8).fill('pawn');

		// Add the back row pieces (major pieces)
		for (let i = 0; i < backRowPieces.length; i++) {
			const cellX = startX + i;
			const cellZ = startZ + 1; // Back row

			gameState.board[cellZ][cellX].chessPiece = {
				type: backRowPieces[i],
				player: playerId
			};
		}

		// Add the front row pieces (pawns)
		for (let i = 0; i < frontRowPieces.length; i++) {
			const cellX = startX + i;
			const cellZ = startZ; // Front row

			gameState.board[cellZ][cellX].chessPiece = {
				type: frontRowPieces[i],
				player: playerId
			};
		}

		console.log('Initialized game world with player:', playerId);
	} catch (error) {
		console.error('Error initializing game world:', error);
	}
}

/**
 * Add a player to an existing game world
 * @param {string} playerId - Player's unique ID
 * @param {string} username - Player's username
 */
function addPlayerToExistingWorld(playerId, username) {
	try {
		const gameState = GameState.getGameState();
		if (!gameState) return;

		// Find a free spot for the new player's home zone
		const homeZonePosition = findFreeHomeZoneSpot(gameState);

		// Generate a unique color for the player (different from existing players)
		let hue;
		let colorHex;
		let isColorUnique = false;

		while (!isColorUnique) {
			hue = Math.random();
			const playerColor = new Color().setHSL(hue, 0.8, 0.5);
			colorHex = playerColor.getHex();

			// Check if this color is significantly different from existing players
			isColorUnique = Object.values(gameState.players).every(player => {
				if (!player.color) return true;
				const existingColor = new Color(player.color);
				const distance = Math.abs(existingColor.r - playerColor.r) +
					Math.abs(existingColor.g - playerColor.g) +
					Math.abs(existingColor.b - playerColor.b);
				return distance > 0.5; // Threshold for sufficient difference
			});
		}

		// Add player to the game state
		gameState.players[playerId] = {
			id: playerId,
			name: username,
			color: colorHex,
			homeZone: homeZonePosition
		};

		// Create home zone for the player
		createPlayerHomeZone(playerId);

		console.log('Added player to existing world:', playerId);
	} catch (error) {
		console.error('Error adding player to existing world:', error);
	}
}

/**
 * Find a free spot for a new player's home zone
 * @param {Object} gameState - Current game state
 * @returns {Object} Position and size for the new home zone
 */
function findFreeHomeZoneSpot(gameState) {
	// Default size for home zones
	const homeZoneSize = 3;

	// Define potential home zone positions
	// Start with corners and edges of the board
	const potentialPositions = [
		{ x: 5, z: 5 },       // Top-left
		{ x: 5, z: 15 },      // Top-right
		{ x: 15, z: 5 },      // Bottom-left
		{ x: 15, z: 15 },     // Bottom-right
		{ x: 10, z: 5 },      // Top-center
		{ x: 10, z: 15 },     // Bottom-center
		{ x: 5, z: 10 },      // Left-center
		{ x: 15, z: 10 }      // Right-center
	];

	// Check existing player home zones
	const existingHomeZones = Object.values(gameState.players)
		.filter(player => player.homeZone)
		.map(player => player.homeZone);

	// Find first position that doesn't overlap with existing home zones
	for (const position of potentialPositions) {
		let isPositionFree = true;

		// Check for overlap with existing home zones
		for (const existingZone of existingHomeZones) {
			// Check if this potential position would overlap with an existing zone
			if (position.x < existingZone.x + existingZone.size &&
				position.x + homeZoneSize > existingZone.x &&
				position.z < existingZone.z + existingZone.size &&
				position.z + homeZoneSize > existingZone.z) {
				isPositionFree = false;
				break;
			}
		}

		if (isPositionFree) {
			return {
				x: position.x,
				z: position.z,
				size: homeZoneSize
			};
		}
	}

	// If all predefined positions are taken, find a random position
	// Keep trying random positions until we find one that doesn't overlap
	const boardSize = gameState.board.length;
	const maxAttempts = 100;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		const x = Math.floor(Math.random() * (boardSize - homeZoneSize));
		const z = Math.floor(Math.random() * (boardSize - homeZoneSize));

		let isPositionFree = true;

		// Check for overlap with existing home zones
		for (const existingZone of existingHomeZones) {
			if (x < existingZone.x + existingZone.size &&
				x + homeZoneSize > existingZone.x &&
				z < existingZone.z + existingZone.size &&
				z + homeZoneSize > existingZone.z) {
				isPositionFree = false;
				break;
			}
		}

		if (isPositionFree) {
			return {
				x: x,
				z: z,
				size: homeZoneSize
			};
		}
	}

	// If we couldn't find a non-overlapping position,
	// just use a position far from the center
	return {
		x: 17,
		z: 17,
		size: homeZoneSize
	};
}

/**
 * Create a home zone for a player and add chess pieces
 * @param {string} playerId - Player's unique ID
 */
function createPlayerHomeZone(playerId) {
	try {
		const gameState = GameState.getGameState();
		if (!gameState || !gameState.players[playerId] || !gameState.players[playerId].homeZone) {
			console.warn(`Cannot create home zone: Player ${playerId} or home zone data not found`);
			return;
		}

		const player = gameState.players[playerId];

		// Update the home zone to use 8x2 dimensions (standard chess layout)
		// Use the center of the existing home zone as the starting point
		const oldZone = player.homeZone;
		const centerX = oldZone.x + Math.floor(oldZone.size / 2);
		const centerZ = oldZone.z + Math.floor(oldZone.size / 2);

		// Create new homeZone with 8x2 dimensions
		const homeZoneWidth = 8;
		const homeZoneHeight = 2;
		const startX = centerX - Math.floor(homeZoneWidth / 2);
		const startZ = centerZ - Math.floor(homeZoneHeight / 2);

		// Update the player's home zone in the game state
		player.homeZone = {
			x: startX,
			z: startZ,
			width: homeZoneWidth,
			height: homeZoneHeight
		};

		// Clear any existing cells in this area
		for (let z = 0; z < gameState.board.length; z++) {
			for (let x = 0; x < gameState.board[z].length; x++) {
				if (gameState.board[z][x] &&
					gameState.board[z][x].player === playerId) {
					gameState.board[z][x] = null;
				}
			}
		}

		// Create home zone cells
		for (let dz = 0; dz < homeZoneHeight; dz++) {
			for (let dx = 0; dx < homeZoneWidth; dx++) {
				const cellX = startX + dx;
				const cellZ = startZ + dz;

				// Make sure we don't go out of bounds
				if (cellX >= 0 && cellX < gameState.board[0].length &&
					cellZ >= 0 && cellZ < gameState.board.length) {
					gameState.board[cellZ][cellX] = {
						type: 'home_zone',
						player: player.id,
						chessPiece: null
					};
				}
			}
		}

		// Add chess pieces in standard chess board arrangement
		// Back row (major pieces)
		const backRowPieces = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
		// Front row (pawns)
		const frontRowPieces = Array(8).fill('pawn');

		// Add the back row pieces (major pieces)
		for (let i = 0; i < backRowPieces.length; i++) {
			const cellX = startX + i;
			const cellZ = startZ + 1; // Back row

			if (cellX >= 0 && cellX < gameState.board[0].length &&
				cellZ >= 0 && cellZ < gameState.board.length) {

				gameState.board[cellZ][cellX].chessPiece = {
					type: backRowPieces[i],
					player: playerId
				};
			}
		}

		// Add the front row pieces (pawns)
		for (let i = 0; i < frontRowPieces.length; i++) {
			const cellX = startX + i;
			const cellZ = startZ; // Front row

			if (cellX >= 0 && cellX < gameState.board[0].length &&
				cellZ >= 0 && cellZ < gameState.board.length) {

				gameState.board[cellZ][cellX].chessPiece = {
					type: frontRowPieces[i],
					player: playerId
				};
			}
		}

		console.log(`Created home zone for player ${playerId} with standard chess layout`);
	} catch (error) {
		console.error('Error creating player home zone:', error);
	}
}

/**
 * Add lights to the scene
 */
function addLights() {
	// Ambient light (soft overall illumination)
	const ambientLight = new AmbientLight(0xd6f5ff, 0.5);
	scene.add(ambientLight);

	// Main directional light (sun)
	const sunLight = new DirectionalLight(0xffffeb, 1.0);
	sunLight.position.set(30, 40, 50);
	sunLight.castShadow = true;

	// Configure shadow properties for better quality
	sunLight.shadow.mapSize.width = 2048;
	sunLight.shadow.mapSize.height = 2048;
	sunLight.shadow.camera.near = 0.5;
	sunLight.shadow.camera.far = 150;
	sunLight.shadow.camera.left = -50;
	sunLight.shadow.camera.right = 50;
	sunLight.shadow.camera.top = 50;
	sunLight.shadow.camera.bottom = -50;
	sunLight.shadow.bias = -0.0003;

	scene.add(sunLight);

	// Opposite fill light (subtle blue for sky reflection)
	const fillLight = new DirectionalLight(0x8cb8ff, 0.4);
	fillLight.position.set(-30, 20, -30);
	scene.add(fillLight);

	// Upward facing point light (ground/water reflection)
	const bounceLight = new PointLight(0x3f88c5, 0.3, 50);
	bounceLight.position.set(0, -10, 0);
	scene.add(bounceLight);

	// Add some atmospheric fog for depth
	scene.fog = new FogExp2(0xd1e9ff, 0.008);
}

/**
 * Load textures and create materials
 */
function loadTextures() {
	try {
		const textureLoader = new THREE.TextureLoader();
		textureLoader.setCrossOrigin('anonymous');

		// Create a default texture (white) for fallbacks
		const defaultTexture = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

		// Create a function to load textures with error handling
		const loadTextureWithFallback = (url, fallbackColor = 0xCCCCCC) => {
			return new Promise((resolve) => {
				textureLoader.load(
					url,
					(texture) => {
						texture.wrapS = THREE.RepeatWrapping;
						texture.wrapT = THREE.RepeatWrapping;
						resolve(texture);
					},
					undefined, // Progress callback
					(error) => {
						console.warn(`Failed to load texture: ${url}`, error);
						// Create a colored material as fallback
						const fallbackMaterial = new THREE.MeshBasicMaterial({ color: fallbackColor });
						resolve(fallbackMaterial);
					}
				);
			});
		};

		// Load all textures with proper error handling
		Promise.all([
			loadTextureWithFallback('textures/board.png', 0x8B4513), // Brown fallback for board
			loadTextureWithFallback('textures/cell.png', 0xAAAAAA),  // Grey fallback for cell
			loadTextureWithFallback('textures/home_zone.png', 0x3366CC) // Blue fallback for home zone
		]).then(([boardTexture, cellTexture, homeZoneTexture]) => {
			// Store the textures or fallback materials
			textures.board = boardTexture;
			textures.cell = cellTexture;
			textures.homeZone = homeZoneTexture;

			// Signal that textures are loaded
			texturesLoaded = true;
		});
	} catch (error) {
		console.error('Error loading textures:', error);
		// Set defaults for all textures in case of error
		textures.board = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
		textures.cell = new THREE.MeshBasicMaterial({ color: 0xAAAAAA });
		textures.homeZone = new THREE.MeshBasicMaterial({ color: 0x3366CC });
		texturesLoaded = true;
	}
}

/**
 * Handle window resize
 */
function onWindowResize() {
	const container = renderer.domElement.parentElement;
	const width = container.clientWidth;
	const height = container.clientHeight;

	camera.aspect = width / height;
	camera.updateProjectionMatrix();

	renderer.setSize(width, height);
}

/**
 * Animation loop
 */
function animate(time = 0) {
	try {
		animationFrameId = requestAnimationFrame(animate);

		// Calculate delta time
		const deltaTime = time - lastRenderTime;
		lastRenderTime = time;

		// Update controls
		if (controls) {
			controls.update();
		}

		// Update the scene
		updateScene(deltaTime);

		// Update player name labels
		updatePlayerLabels();

		// Render the scene
		if (renderer && scene && camera) {
			renderer.render(scene, camera);
		}
	} catch (error) {
		console.error('Error in animation loop:', error);
		// Don't stop the animation loop on error
	}
}

/**
 * Update the positions of player name labels
 */
function updatePlayerLabels() {
	if (!playerLabels || !playerLabels.length || !camera) return;

	playerLabels.forEach(label => {
		if (!label.userData) return;

		// Get world position
		const position = new Vector3(
			label.userData.x,
			label.userData.y,
			label.userData.z
		);

		// Convert to screen position
		const screenPosition = position.clone();
		screenPosition.project(camera);

		// Convert to CSS coordinates
		const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
		const y = (1 - (screenPosition.y * 0.5 + 0.5)) * window.innerHeight;

		// Apply screen position
		label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;

		// Hide if behind camera
		if (screenPosition.z > 1) {
			label.style.display = 'none';
		} else {
			label.style.display = 'block';
		}
	});
}

/**
 * Update the scene
 * @param {number} deltaTime - Time since last update in ms
 */
function updateScene(deltaTime) {
	try {
		// Update board
		updateBoard();

		// Update chess pieces
		updateChessPieces();

		// Update falling tetromino
		updateFallingTetromino();

		// Update ghost piece
		updateGhostPiece();

		// Animate potions and particles
		animatePotionsAndParticles(deltaTime);

		// Update UI
		updateUI();
	} catch (error) {
		console.error('Error updating scene:', error);
	}
}

/**
 * Animate potions and particles
 * @param {number} deltaTime - Time since last update in ms
 */
function animatePotionsAndParticles(deltaTime) {
	const time = performance.now() / 1000; // Convert to seconds for smoother animation

	// Find all potion meshes and particles
	boardGroup.children.forEach(child => {
		// Animate potions (bobbing up and down)
		if (child.userData.potionType) {
			const originalY = child.userData.originalY || 0;
			child.position.y = originalY + Math.sin(time * 2) * 0.1;
			child.rotation.y += 0.01;
		}

		// Animate particles (orbiting and pulsing)
		if (child.userData.angleOffset !== undefined) {
			const originalY = child.userData.originalY || 0;
			const angleOffset = child.userData.angleOffset || 0;
			const radiusOffset = child.userData.radiusOffset || 0;

			// Calculate position in orbit
			const orbitSpeed = 0.5 + radiusOffset;
			const orbitAngle = time * orbitSpeed + angleOffset;
			const orbitRadius = 0.4 + Math.sin(time + angleOffset) * 0.1;

			// Calculate center of orbit (the potion position)
			const centerX = child.position.x;
			const centerZ = child.position.z;

			// Update position
			child.position.x = centerX + Math.cos(orbitAngle) * orbitRadius * 0.1;
			child.position.y = originalY + Math.sin(time * 3 + angleOffset) * 0.05;
			child.position.z = centerZ + Math.sin(orbitAngle) * orbitRadius * 0.1;

			// Pulse opacity
			if (child.material) {
				child.material.opacity = 0.5 + Math.sin(time * 2 + angleOffset) * 0.3;
			}
		}
	});
}

/**
 * Update the game board based on the current game state
 */
function updateBoard() {
	const gameState = GameState.getGameState();
	if (!gameState || !gameState.board) return;

	// Only clear and rebuild board if something has changed
	// Use a static variable to track if we need to rebuild
	updateBoard.lastBoardState = updateBoard.lastBoardState || "";
	const currentBoardState = JSON.stringify(gameState.board);

	if (updateBoard.lastBoardState === currentBoardState) {
		return; // No change in the board, skip rebuilding
	}

	// Update the last board state
	updateBoard.lastBoardState = currentBoardState;

	// Clear existing board cells
	while (boardGroup.children.length > 0) {
		boardGroup.remove(boardGroup.children[0]);
	}

	let activeCellsCount = 0;
	const topGeometry = new THREE.BoxGeometry(1, 0.2, 1);

	// Add cells based on the game state
	for (let z = 0; z < gameState.board.length; z++) {
		for (let x = 0; x < gameState.board[z].length; x++) {
			const cell = gameState.board[z][x];
			if (cell && cell.type) {
				// Create a unique ID for this cell based on its position
				const cellId = `${x},${z}`;

				// Check if we have decoration data for this cell
				if (!gameState.cellDecorations) {
					gameState.cellDecorations = new Map();
				}

				// If we don't have decoration data for this cell yet, create it
				if (!gameState.cellDecorations.has(cellId)) {
					// Generate a seed based on cell position for consistent randomness
					const seed = x * 1000 + z;

					// Create decoration data with consistent positioning
					gameState.cellDecorations.set(cellId, {
						hasStone: Math.floor((Math.sin(seed * 0.1) + 1) * 3.5) === 0,
						hasMushroom: Math.floor((Math.cos(seed * 0.2) + 1) * 4.5) === 0,
						hasGrass: Math.floor((Math.sin(seed * 0.3) + 1) * 2.5) > 0,
						seed: seed
					});
				}

				// Add the floating cell with its decorations
				createFloatingCell(cell, x, z, gameState.cellSize, topGeometry,
					gameState.cellDecorations.get(cellId));
				activeCellsCount++;

				// Add a potion if the cell has one
				if (cell.potion) {
					addPotionToCell(cell, x, z);
				}
			}
		}
	}

	// Log rendered cells only when they change, not every frame
	console.log(`Rendered ${activeCellsCount} active cells`);
}

/**
 * Create a floating cell with top and bottom parts
 * @param {Object} cell - Cell data
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} cellSize - Size of the cell
 * @param {Object} topGeometry - Geometry for the top part
 * @param {Object} decorationData - Persistent decoration data for the cell
 * @returns {Group} Cell group
 */
function createFloatingCell(cell, x, z, cellSize, topGeometry, decorationData) {
	try {
		// Create a group to hold all cell components
		const cellGroup = new THREE.Group();

		// Get material based on cell type and player
		let material;
		if (cell.type === 'HOME_ZONE') {
			const color = cell.playerId ? playerColors[cell.playerId] : 0xCCCCCC;
			material = new THREE.MeshPhongMaterial({
				color: color,
				transparent: true,
				opacity: 0.85,
				side: THREE.DoubleSide
			});
		} else {
			material = new THREE.MeshPhongMaterial({
				color: 0xFFFFFF,
				transparent: true,
				opacity: 0.7,
				side: THREE.DoubleSide
			});
		}

		// Create cell top
		const topMesh = new THREE.Mesh(topGeometry, material);

		// Set position with slight random offset for natural look
		const height = getFloatingHeight(x, z);
		topMesh.position.set(x, height, z);
		cellGroup.add(topMesh);

		// Add cell bottom (decorative elements)
		addCellBottom(x, z, cellSize, material.color);

		// Add decorations if the data indicates they should be present
		if (decorationData) {
			if (decorationData.hasStone) {
				addStoneDecoration(x, z, height + 0.1, cellSize, decorationData.seed);
			}

			if (decorationData.hasMushroom) {
				addMushroomDecoration(x, z, height + 0.1, cellSize, decorationData.seed);
			}

			if (decorationData.hasGrass) {
				addGrassTuft(x, z, cellSize * 0.4, decorationData.seed);
			}
		}

		// Add cell to the board group
		boardGroup.add(cellGroup);
		return cellGroup;
	} catch (error) {
		console.error('Error creating floating cell:', error);
		return null;
	}
}

/**
 * Add decorations using persistent decoration data
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} cellSize - Size of the cell
 * @param {Object} decorationData - Decoration data for this cell
 */
function addPersistentDecoration(x, z, cellSize, decorationData) {
	try {
		const gameState = GameState.getGameState();

		// Create a normalized position from the board coordinates
		const boardWidth = gameState.board[0].length;
		const boardHeight = gameState.board.length;
		const centerX = (boardWidth - 1) / 2;
		const centerZ = (boardHeight - 1) / 2;

		const normalizedX = (x - centerX) * cellSize;
		const normalizedZ = (z - centerZ) * cellSize;

		// Get the floating height for this cell
		const cellY = getFloatingHeight(x, z);

		// Set a deterministic seed for this cell to ensure consistent randomness
		const seed = decorationData.seed;

		// Use the decoration type from the persistent data
		switch (decorationData.decorationType) {
			case 0:
				// Stone decorations
				addStoneDecoration(normalizedX, normalizedZ, cellY, cellSize, seed);
				break;
			case 1:
				// Grass tufts
				addGrassTuft(normalizedX, normalizedZ, cellSize * 0.4, seed);
				break;
			case 2:
				// Mushroom decorations
				addMushroomDecoration(normalizedX, normalizedZ, cellY, cellSize, seed);
				break;
		}
	} catch (error) {
		console.error('Error adding persistent decoration:', error);
	}
}

/**
 * Create a floating island for the game board
 * @param {number} width - Width of the island
 * @param {number} height - Height of the island
 */
function createFloatingIsland(width, height) {
	// Create the main flat part of the island
	const boardDepth = Constants.CELL_SIZE * 0.5;

	// Create the top flat part of the island
	const boardGeometry = new BoxGeometry(
		width,
		boardDepth,
		height
	);

	const boardMesh = new Mesh(boardGeometry, materials.board);
	boardMesh.position.set(0, -boardDepth / 2, 0);
	boardMesh.receiveShadow = true;
	boardGroup.add(boardMesh);

	// Create the bottom part of the island with a more interesting shape
	// We'll use multiple meshes to create a rough, natural look
	createIslandBottom(width, height);

	// Add some rocks and vegetation around the edges
	addIslandDecorations(width, height);
}

/**
 * Create the bottom part of the floating island
 * @param {number} width - Width of the island
 * @param {number} height - Height of the island
 */
function createIslandBottom(width, height) {
	// Create the bottom part of the island
	const bottomDepth = Constants.CELL_SIZE * 4; // Much thicker than the top

	// Create the main bottom part
	const bottomGeometry = new BoxGeometry(
		width * 0.9, // Slightly smaller than the top
		bottomDepth,
		height * 0.9
	);

	const bottomMaterial = new MeshStandardMaterial({
		color: 0x795548, // Brown color for the earth/rock
		roughness: 0.9,
		metalness: 0.1
	});

	const bottomMesh = new Mesh(bottomGeometry, bottomMaterial);
	bottomMesh.position.set(0, -bottomDepth / 2 - Constants.CELL_SIZE * 0.5, 0);
	bottomMesh.receiveShadow = true;
	bottomMesh.castShadow = true;
	boardGroup.add(bottomMesh);

	// Add some random rocky outcroppings
	const rockCount = 16;
	for (let i = 0; i < rockCount; i++) {
		const angle = (i / rockCount) * Math.PI * 2;
		const distance = Math.min(width, height) * 0.45;

		const x = Math.cos(angle) * distance;
		const z = Math.sin(angle) * distance;

		// Randomize the rock sizes
		const rockWidth = Math.random() * (width * 0.2) + width * 0.05;
		const rockHeight = Math.random() * (height * 0.2) + height * 0.05;
		const rockDepth = Math.random() * (bottomDepth * 0.8) + bottomDepth * 0.4;

		const rockGeometry = new BoxGeometry(rockWidth, rockDepth, rockHeight);

		// Vary the color slightly
		const rockMaterial = new MeshStandardMaterial({
			color: new Color(0x795548).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2),
			roughness: 0.8 + Math.random() * 0.2,
			metalness: 0.1
		});

		const rockMesh = new Mesh(rockGeometry, rockMaterial);
		rockMesh.position.set(
			x,
			-rockDepth / 2 - Constants.CELL_SIZE * 0.5,
			z
		);

		// Rotate the rock slightly for more variety
		rockMesh.rotation.y = Math.random() * Math.PI;
		rockMesh.rotation.x = (Math.random() - 0.5) * 0.2;
		rockMesh.rotation.z = (Math.random() - 0.5) * 0.2;

		rockMesh.receiveShadow = true;
		rockMesh.castShadow = true;
		boardGroup.add(rockMesh);
	}

	// Add some stalactite-like rocks hanging from the bottom
	for (let i = 0; i < 24; i++) {
		const x = (Math.random() - 0.5) * width * 0.8;
		const z = (Math.random() - 0.5) * height * 0.8;

		const stalactiteHeight = Math.random() * bottomDepth * 2 + bottomDepth * 0.5;
		const stalactiteRadius = Math.random() * (Constants.CELL_SIZE * 0.5) + Constants.CELL_SIZE * 0.1;

		const stalactiteGeometry = new CylinderGeometry(
			stalactiteRadius * 0.2, // Narrow at the bottom
			stalactiteRadius,       // Wider at the top
			stalactiteHeight,
			6
		);

		const stalactiteMaterial = new MeshStandardMaterial({
			color: new Color(0x795548).offsetHSL(0, 0, (Math.random() - 0.5) * 0.3 - 0.2),
			roughness: 0.9,
			metalness: 0.05
		});

		const stalactiteMesh = new Mesh(stalactiteGeometry, stalactiteMaterial);
		stalactiteMesh.position.set(
			x,
			-stalactiteHeight / 2 - bottomDepth - Constants.CELL_SIZE * 0.5,
			z
		);

		stalactiteMesh.receiveShadow = true;
		stalactiteMesh.castShadow = true;
		boardGroup.add(stalactiteMesh);
	}
}

/**
 * Add decorative elements around the island edges
 * @param {number} width - Width of the island
 * @param {number} height - Height of the island
 */
function addIslandDecorations(width, height) {
	// Add some rocks around the edges
	const stoneCount = 32;
	for (let i = 0; i < stoneCount; i++) {
		const angle = (i / stoneCount) * Math.PI * 2 + Math.random() * 0.2;
		const distance = Math.min(width, height) * (0.48 + Math.random() * 0.04);

		const x = Math.cos(angle) * distance;
		const z = Math.sin(angle) * distance;

		// Create a small stone
		const stoneRadius = Math.random() * (Constants.CELL_SIZE * 0.4) + Constants.CELL_SIZE * 0.1;
		const stoneGeometry = new SphereGeometry(stoneRadius, 6, 4);

		const stoneMaterial = new MeshStandardMaterial({
			color: new Color(0xAAAAAA).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2),
			roughness: 0.8,
			metalness: 0.2
		});

		const stoneMesh = new Mesh(stoneGeometry, stoneMaterial);
		stoneMesh.position.set(
			x,
			stoneRadius * 0.3,
			z
		);

		// Deform the stone a bit
		stoneMesh.scale.set(
			1 + Math.random() * 0.4,
			0.5 + Math.random() * 0.3,
			1 + Math.random() * 0.4
		);

		stoneMesh.rotation.y = Math.random() * Math.PI;
		stoneMesh.receiveShadow = true;
		stoneMesh.castShadow = true;
		boardGroup.add(stoneMesh);

		// Occasionally add grass or vegetation near the stones
		if (Math.random() > 0.4) {
			addGrassTuft(x, z, stoneRadius);
		}
	}
}

/**
 * Add grass tufts as decoration
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} radius - Approximate radius of the tuft
 * @param {number} seed - Seed for deterministic randomness
 */
function addGrassTuft(x, z, radius, seed = 0) {
	try {
		// Create a pseudo-random function based on the seed
		const pseudoRandom = (multiplier = 1, offset = 0) => {
			const value = Math.sin(seed * 0.1 + offset) * 10000;
			return (value - Math.floor(value)) * multiplier;
		};

		// Create a group for the grass
		const grassGroup = new THREE.Group();

		// Get the cell height
		const height = getFloatingHeight(x, z);

		// Determine number of grass blades (3-7)
		const bladeCount = Math.floor(pseudoRandom(5, 0.3)) + 3;

		// Create grass blades
		for (let i = 0; i < bladeCount; i++) {
			// Deterministic random position within radius
			const angle = pseudoRandom(Math.PI * 2, i * 0.4);
			const distance = pseudoRandom(radius, i * 0.5);

			const posX = x + Math.cos(angle) * distance;
			const posZ = z + Math.sin(angle) * distance;

			// Create blade height (0.1 to 0.25)
			const bladeHeight = pseudoRandom(0.15, i * 0.6) + 0.1;

			// Create a simple blade of grass using a narrow box
			const bladeGeometry = new THREE.BoxGeometry(0.02, bladeHeight, 0.02);

			// Green color with slight variation
			const greenHue = 0.3 + pseudoRandom(0.1, i);
			const greenSaturation = 0.7 + pseudoRandom(0.3, i + 0.1);
			const greenLightness = 0.4 + pseudoRandom(0.2, i + 0.2);

			const grassColor = new THREE.Color().setHSL(greenHue, greenSaturation, greenLightness);
			const grassMaterial = new THREE.MeshStandardMaterial({
				color: grassColor,
				roughness: 0.9
			});

			const blade = new THREE.Mesh(bladeGeometry, grassMaterial);

			// Position at bottom of cell and slight tilt
			blade.position.set(posX, height + bladeHeight / 2, posZ);

			// Tilt in random direction
			const tiltX = pseudoRandom(0.3, i + 0.7) - 0.15;
			const tiltZ = pseudoRandom(0.3, i + 0.8) - 0.15;
			blade.rotation.set(tiltX, 0, tiltZ);

			// Add to the group and the board
			grassGroup.add(blade);
			boardGroup.add(blade);
		}

		return grassGroup;
	} catch (error) {
		console.error('Error adding grass tuft:', error);
		return null;
	}
}

/**
 * Add a potion visual to a cell
 * @param {Object} cell - The cell data containing the potion and coordinates
 */
function addPotionToCell(cell) {
	// Get the game state
	const gameState = GameState.getGameState();

	// Create a sphere for the potion
	const potionGeometry = new SphereGeometry(Constants.CELL_SIZE * 0.3, 16, 16);

	// Determine potion color based on type
	let potionColor;
	switch (cell.potion.type) {
		case 'speed':
			potionColor = 0x3498db; // Blue for speed
			break;
		case 'power':
			potionColor = 0xe74c3c; // Red for power
			break;
		case 'freeze':
			potionColor = 0x2ecc71; // Green for freeze
			break;
		default:
			potionColor = 0xf1c40f; // Yellow for unknown
	}

	// Create emissive material for the potion to make it glow
	const potionMaterial = new MeshStandardMaterial({
		color: potionColor,
		emissive: potionColor,
		emissiveIntensity: 0.5,
		transparent: true,
		opacity: 0.8
	});

	const potionMesh = new Mesh(potionGeometry, potionMaterial);

	// Position the potion above the cell and make it float
	const cellX = (cell.x - (gameState.board[0].length - 1) / 2) * Constants.CELL_SIZE;
	const cellZ = (cell.y - (gameState.board.length - 1) / 2) * Constants.CELL_SIZE;

	potionMesh.position.set(cellX, Constants.CELL_SIZE * 0.5, cellZ);
	potionMesh.castShadow = true;

	// Store initial position for animation
	potionMesh.userData.originalY = potionMesh.position.y;
	potionMesh.userData.potionType = cell.potion.type;

	// Add to board group
	boardGroup.add(potionMesh);

	// Add a glowing particle effect around the potion
	addPotionParticles(cellX, cellZ, potionColor);
}

/**
 * Add glowing particles around a potion
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} color - Color of the potion
 */
function addPotionParticles(x, z, color) {
	const particleCount = 8;

	for (let i = 0; i < particleCount; i++) {
		const particleSize = Constants.CELL_SIZE * (0.05 + Math.random() * 0.05);
		const particleGeometry = new SphereGeometry(particleSize, 4, 4);

		// Create a glowing material
		const particleMaterial = new MeshBasicMaterial({
			color: color,
			transparent: true,
			opacity: 0.7
		});

		const particle = new Mesh(particleGeometry, particleMaterial);

		// Position in a circle around the potion
		const angle = (i / particleCount) * Math.PI * 2;
		const distance = Constants.CELL_SIZE * 0.4;

		particle.position.set(
			x + Math.cos(angle) * distance,
			Constants.CELL_SIZE * 0.5 + Math.sin(i * 0.5) * 0.2, // Slight height variation
			z + Math.sin(angle) * distance
		);

		// Store animation data
		particle.userData.originalY = particle.position.y;
		particle.userData.angleOffset = i * (Math.PI * 2 / particleCount);
		particle.userData.radiusOffset = Math.random() * 0.2;

		boardGroup.add(particle);
	}
}

/**
 * Update chess pieces based on game state
 */
function updateChessPieces() {
	const gameState = GameState.getGameState();
	if (!gameState || !gameState.board) return;

	// Only clear and rebuild pieces if something has changed
	// Use a static variable to track if we need to rebuild
	updateChessPieces.lastBoardState = updateChessPieces.lastBoardState || "";
	const currentBoardState = JSON.stringify(gameState.board);

	if (updateChessPieces.lastBoardState === currentBoardState) {
		return; // No change in the board, skip rebuilding
	}

	// Update the last board state
	updateChessPieces.lastBoardState = currentBoardState;

	// Clear existing pieces
	while (piecesGroup.children.length > 0) {
		piecesGroup.remove(piecesGroup.children[0]);
	}

	let piecesAdded = 0;

	// Add pieces based on the game state
	try {
		for (let y = 0; y < gameState.board.length; y++) {
			for (let x = 0; x < gameState.board[y].length; x++) {
				const cell = gameState.board[y][x];
				if (cell && cell.chessPiece) {
					// Ensure the cell has a valid playerId
					const playerId = cell.playerId || cell.chessPiece.player || 'unknown';
					addChessPiece(cell.chessPiece, playerId, x, y);
					piecesAdded++;
				}
			}
		}

		// Log added pieces only when they change, not every frame
		console.log(`Added ${piecesAdded} chess pieces to the scene`);
	} catch (error) {
		console.error('Error updating chess pieces:', error);
	}
}

/**
 * Update the falling tetromino
 */
function updateFallingTetromino() {
	// Clear the tetromino group
	while (tetrominoGroup.children.length > 0) {
		tetrominoGroup.remove(tetrominoGroup.children[0]);
	}

	const gameState = GameState.getGameState();
	const { fallingPiece } = gameState;

	if (!fallingPiece) {
		return;
	}

	// Create a group for the tetromino
	const tetrominoGroup3D = new Group();

	// Add blocks to the tetromino
	fallingPiece.blocks.forEach(block => {
		const blockGeometry = new BoxGeometry(
			Constants.CELL_SIZE * 0.9,
			Constants.CELL_SIZE * 0.9,
			Constants.CELL_SIZE * 0.9
		);

		const blockMaterial = materials[`tetromino_${fallingPiece.type}`] ||
			new MeshStandardMaterial({
				color: Constants.TETROMINO_COLORS[fallingPiece.type] || 0xCCCCCC,
				roughness: 0.7,
				metalness: 0.3
			});

		const blockMesh = new Mesh(blockGeometry, blockMaterial);

		// Position the block
		const x = (fallingPiece.x + block.x - (gameState.board[0].length - 1) / 2) * Constants.CELL_SIZE;
		const y = Constants.CELL_SIZE * 0.45; // Slight elevation above board
		const z = (fallingPiece.y + block.y - (gameState.board.length - 1) / 2) * Constants.CELL_SIZE;

		blockMesh.position.set(x, y, z);
		blockMesh.castShadow = true;

		tetrominoGroup3D.add(blockMesh);
	});

	// Add the chess piece to the first block if it's a falling chess piece
	if (fallingPiece.chessPiece) {
		const firstBlock = fallingPiece.blocks[0];
		const x = (fallingPiece.x + firstBlock.x - (gameState.board[0].length - 1) / 2) * Constants.CELL_SIZE;
		const y = Constants.CELL_SIZE * 0.9; // Place on top of the block
		const z = (fallingPiece.y + firstBlock.y - (gameState.board.length - 1) / 2) * Constants.CELL_SIZE;

		const pieceScale = 0.8;
		const piece = addChessPiece(fallingPiece.chessPiece, materials.chessPieceWhite, x, y);
		piece.position.set(x, y, z);
		piece.scale.set(pieceScale, pieceScale, pieceScale);

		tetrominoGroup3D.add(piece);
	}

	// Add the tetromino to the scene
	tetrominoGroup.add(tetrominoGroup3D);
}

/**
 * Update the ghost piece (preview of where the tetromino will land)
 */
function updateGhostPiece() {
	const ghostPiece = TetrominoManager.getGhostPiece();

	if (!ghostPiece) {
		return;
	}

	// Create a group for the ghost piece
	const ghostGroup = new Group();

	// Add blocks to the ghost piece
	ghostPiece.blocks.forEach(block => {
		const blockGeometry = new BoxGeometry(
			Constants.CELL_SIZE * 0.8,
			Constants.CELL_SIZE * 0.8,
			Constants.CELL_SIZE * 0.8
		);

		const blockMaterial = new MeshStandardMaterial({
			color: Constants.TETROMINO_COLORS[ghostPiece.type] || 0xCCCCCC,
			roughness: 0.7,
			metalness: 0.3,
			transparent: true,
			opacity: 0.3
		});

		const blockMesh = new Mesh(blockGeometry, blockMaterial);

		// Position the block
		const gameState = GameState.getGameState();
		const x = (ghostPiece.x + block.x - (gameState.board[0].length - 1) / 2) * Constants.CELL_SIZE;
		const y = Constants.CELL_SIZE * 0.4; // At board level
		const z = (ghostPiece.y + block.y - (gameState.board.length - 1) / 2) * Constants.CELL_SIZE;

		blockMesh.position.set(x, y, z);

		ghostGroup.add(blockMesh);
	});

	tetrominoGroup.add(ghostGroup);
}

/**
 * Update UI elements
 */
function updateUI() {
	const gameState = GameState.getGameState();
	const sessionData = SessionManager.getSessionData();
	const playerId = sessionData.playerId;

	// Update the info panel
	const infoPanel = document.getElementById('info-panel');
	if (infoPanel) {
		let message = 'Chesstris - Game in Progress';

		// Check if the player can make chess moves
		if (!canPlayerMakeChessMoves()) {
			message = 'Place Tetris pieces to build the board before moving chess pieces';
		}

		infoPanel.textContent = message;
	}
}

/**
 * Clean up the renderer
 */
export function cleanup() {
	// Stop the animation loop
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
	}

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

	// Dispose of the renderer
	renderer.dispose();
}

/**
 * Create a skybox for the background
 */
function createSkybox() {
	// Create a large sphere for the sky
	const skyGeometry = new SphereGeometry(500, 32, 32);

	// Create a gradient sky material
	const skyMaterial = new MeshBasicMaterial({
		side: BackSide,
		vertexColors: true
	});

	// Create the sky mesh
	const skyMesh = new Mesh(skyGeometry, skyMaterial);
	scene.add(skyMesh);

	// Add gradient colors to the vertices
	const skyColors = [
		new Color(0x1a237e), // Deep blue at top
		new Color(0x42a5f5), // Light blue at middle
		new Color(0xbbdefb)  // Very light blue/white at horizon
	];

	const positions = skyGeometry.attributes.position;
	const colors = [];

	for (let i = 0; i < positions.count; i++) {
		const y = positions.getY(i);
		const normalizedY = (y + 1) / 2; // Convert from -1,1 to 0,1

		// Blend between colors based on y position
		let color;
		if (normalizedY > 0.5) {
			// Blend between deep blue and light blue
			const t = (normalizedY - 0.5) * 2;
			color = new Color().lerpColors(skyColors[1], skyColors[0], t);
		} else {
			// Blend between light blue and horizon
			const t = normalizedY * 2;
			color = new Color().lerpColors(skyColors[2], skyColors[1], t);
		}

		colors.push(color.r, color.g, color.b);
	}

	skyGeometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));

	// Add some distant clouds (simple white planes at different distances)
	addClouds();

	return skyMesh;
}

/**
 * Add floating clouds to the sky
 */
function addClouds() {
	const cloudCount = 30;
	const cloudGroup = new Group();
	scene.add(cloudGroup);

	for (let i = 0; i < cloudCount; i++) {
		// Create a simple plane for each cloud
		const cloudWidth = Math.random() * 30 + 10;
		const cloudHeight = Math.random() * 15 + 5;
		const cloudGeometry = new PlaneGeometry(cloudWidth, cloudHeight);

		// Create cloud material with transparency
		const cloudMaterial = new MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: Math.random() * 0.5 + 0.3,
			side: DoubleSide
		});

		const cloud = new Mesh(cloudGeometry, cloudMaterial);

		// Position the cloud randomly in the sky at a large distance
		const distance = Math.random() * 200 + 200;
		const angle = Math.random() * Math.PI * 2;
		const height = Math.random() * 100 - 20;

		cloud.position.set(
			Math.cos(angle) * distance,
			height,
			Math.sin(angle) * distance
		);

		// Rotate to face center approximately
		cloud.lookAt(0, cloud.position.y, 0);

		// Add some variation to the rotation
		cloud.rotation.z = Math.random() * Math.PI * 2;

		cloudGroup.add(cloud);
	}
}

/**
 * Add a bottom part to a cell (stalactite-like structure)
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} cellSize - Size of the cell
 * @param {Color|number} color - Color for the bottom part
 */
function addCellBottom(x, z, cellSize, color) {
	try {
		// Create a group to hold all bottom elements
		const bottomGroup = new THREE.Group();

		// Add code to validate parameters
		if (isNaN(x) || isNaN(z) || isNaN(cellSize)) {
			console.warn(`Invalid parameters in addCellBottom: x=${x}, z=${z}, cellSize=${cellSize}`);
			return bottomGroup; // Return empty group to avoid errors
		}

		// Determine if this cell should have stalactites based on position
		const seed = Math.abs(Math.floor(x * 1000 + z));
		const pseudoRandom = (multiplier = 1, offset = 0) => {
			const val = ((seed + offset) * 9301 + 49297) % 233280;
			return (val / 233280) * multiplier;
		};

		const hasStalactites = pseudoRandom() < 0.3; // 30% chance

		if (hasStalactites) {
			const count = Math.floor(pseudoRandom(3, 100)) + 1;

			for (let i = 0; i < count; i++) {
				// Calculate stalactite parameters
				let radius = cellSize * 0.07 * (pseudoRandom(1, i * 10) + 0.5);
				let height = cellSize * (0.2 + pseudoRandom(0.2, i * 20));

				// Validate to prevent NaN values
				radius = isNaN(radius) ? cellSize * 0.05 : radius;
				height = isNaN(height) ? cellSize * 0.2 : height;

				// Create stalactite
				const stalactiteGeometry = new THREE.ConeGeometry(
					radius,
					height,
					8
				);

				const darkerColor = new THREE.Color(color).multiplyScalar(0.7);
				const stalactiteMaterial = new THREE.MeshStandardMaterial({
					color: darkerColor,
					roughness: 0.9,
					metalness: 0.1
				});

				const stalactite = new THREE.Mesh(stalactiteGeometry, stalactiteMaterial);

				// Position stalactite
				let offsetX = (pseudoRandom(cellSize * 0.8, i * 30) - cellSize * 0.4);
				let offsetZ = (pseudoRandom(cellSize * 0.8, i * 40) - cellSize * 0.4);

				// Validate to prevent NaN values
				offsetX = isNaN(offsetX) ? 0 : offsetX;
				offsetZ = isNaN(offsetZ) ? 0 : offsetZ;

				stalactite.position.set(
					x + offsetX,
					getFloatingHeight(x, z) - (cellSize * 0.5) - (height * 0.5),
					z + offsetZ
				);

				// Point stalactite downward
				stalactite.rotation.x = Math.PI;

				bottomGroup.add(stalactite);
			}
		}

		return bottomGroup;
	} catch (error) {
		console.error('Error creating cell bottom:', error);
		return new THREE.Group(); // Return empty group on error
	}
}

/**
 * Add a decorative element to a cell
 * @param {number} x - X position
 * @param {number} z - Z position 
 * @param {number} cellSize - Size of the cell
 */
function addCellDecoration(x, z, cellSize) {
	// Create a decoration based on pseudorandom position
	const seed = Math.abs(x * 1000 + z);
	const decorationType = Math.floor(pseudoRandom(4, seed));

	// Apply the appropriate decoration
	switch (decorationType) {
		case 0:
			// Grass tufts
			addGrassTuft(x, z, cellSize * 0.1, seed);
			break;
		case 1:
			// Stones
			addStoneDecoration(x, z, getFloatingHeight(x, z), cellSize, seed);
			break;
		case 2:
			// Mushrooms
			addMushroomDecoration(x, z, getFloatingHeight(x, z), cellSize, seed);
			break;
		case 3:
			// Stalactites hanging below the cell
			const yPos = getFloatingHeight(x, z) - (cellSize * 0.5);
			const stalactiteRadius = cellSize * 0.15 * pseudoRandom(1, seed + 1);
			const stalactiteHeight = cellSize * 0.3 * pseudoRandom(1, seed + 2);

			// Validate geometry parameters
			const params = validateGeometryParams({
				radius: stalactiteRadius,
				height: stalactiteHeight
			});

			const stalactiteGeometry = new THREE.ConeGeometry(
				params.radius,
				params.height,
				8
			);

			const stalactiteMaterial = new THREE.MeshStandardMaterial({
				color: 0x888888,
				roughness: 0.8,
				metalness: 0.2
			});

			const stalactite = new THREE.Mesh(stalactiteGeometry, stalactiteMaterial);
			stalactite.position.set(x, yPos - (params.height * 0.5), z);
			stalactite.rotation.x = Math.PI; // Point downward

			decorationsGroup.add(stalactite);
			break;
	}

	// Track that we've added a decoration at this position
	decorationPositions.set(`${x},${z}`, decorationType);
}

/**
 * Add stone decoration to a cell
 * @param {number} x - Normalized X position
 * @param {number} z - Normalized Z position
 * @param {number} y - Y position (height)
 * @param {number} cellSize - Size of the cell
 * @param {number} seed - Seed for deterministic randomness
 */
function addStoneDecoration(x, z, y, cellSize, seed = 0) {
	// Create a small group of stones
	const stoneGroup = new Group();
	stoneGroup.position.set(x, y, z);

	// Use the seed to create pseudo-random values
	const pseudoRandom = (multiplier = 1, offset = 0) => {
		// Simple LCG-based deterministic random number generator
		seed = (seed * 1664525 + 1013904223) % 4294967296;
		return ((seed / 4294967296) * multiplier + offset);
	};

	// Random number of stones (1-3)
	const stoneCount = Math.floor(pseudoRandom(3) + 1);

	for (let i = 0; i < stoneCount; i++) {
		// Create a random stone shape
		const stoneSize = pseudoRandom(0.15, 0.05);
		const stoneGeometry = new SphereGeometry(stoneSize, 4, 4);

		// Create a gray material with random shade
		const stoneBrightness = pseudoRandom(0.2, 0.4); // 0.4-0.6 range
		const stoneMaterial = new MeshStandardMaterial({
			color: new Color(stoneBrightness, stoneBrightness, stoneBrightness),
			roughness: 0.9,
			metalness: 0.1
		});

		const stone = new Mesh(stoneGeometry, stoneMaterial);

		// Position randomly on the cell
		const posX = (pseudoRandom(1, -0.5)) * 0.6 * cellSize;
		const posZ = (pseudoRandom(1, -0.5)) * 0.6 * cellSize;

		stone.position.set(posX, 0.05 + stoneSize * 0.5, posZ);

		// Apply random rotation
		stone.rotation.set(
			pseudoRandom(Math.PI),
			pseudoRandom(Math.PI),
			pseudoRandom(Math.PI)
		);

		stoneGroup.add(stone);
	}

	boardGroup.add(stoneGroup);
}

/**
 * Add mushroom decoration to a cell
 * @param {number} x - Normalized X position
 * @param {number} z - Normalized Z position
 * @param {number} y - Y position (height)
 * @param {number} cellSize - Size of the cell
 * @param {number} seed - Seed for deterministic randomness
 */
function addMushroomDecoration(x, z, y, cellSize, seed = 0) {
	// Create a group for the mushrooms
	const mushroomGroup = new Group();
	mushroomGroup.position.set(x, y, z);

	// Use the seed to create pseudo-random values
	const pseudoRandom = (multiplier = 1, offset = 0) => {
		// Simple LCG-based deterministic random number generator
		seed = (seed * 1664525 + 1013904223) % 4294967296;
		return ((seed / 4294967296) * multiplier + offset);
	};

	// Random number of mushrooms (1-2)
	const mushroomCount = Math.floor(pseudoRandom(2) + 1);

	for (let i = 0; i < mushroomCount; i++) {
		// Create a mushroom group
		const mushroom = new Group();

		// Random size
		const scale = pseudoRandom(0.5, 0.5);
		mushroom.scale.set(scale, scale, scale);

		// Stem
		const stemHeight = 0.12;
		const stemRadius = 0.02;
		const stemGeometry = new CylinderGeometry(stemRadius, stemRadius * 1.2, stemHeight, 8);

		const stemMaterial = new MeshStandardMaterial({
			color: new Color(0.9, 0.9, 0.8),
			roughness: 0.8
		});

		const stem = new Mesh(stemGeometry, stemMaterial);
		stem.position.y = stemHeight * 0.5;

		// Cap
		const capRadius = stemRadius * 3;
		const capHeight = stemHeight * 0.5;
		const capGeometry = new SphereGeometry(capRadius, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);

		// Choose a mushroom color based on the seed
		let capColor;
		if (pseudoRandom() > 0.5) {
			// Red mushroom
			capColor = new Color(0.8, 0.1, 0.1);
		} else {
			// Brown mushroom
			capColor = new Color(0.6, 0.3, 0.1);
		}

		const capMaterial = new MeshStandardMaterial({
			color: capColor,
			roughness: 0.7
		});

		const cap = new Mesh(capGeometry, capMaterial);
		cap.position.y = stemHeight;
		cap.rotation.x = Math.PI; // Flip to create a cap shape

		mushroom.add(stem);
		mushroom.add(cap);

		// Position randomly on the cell
		const posX = (pseudoRandom(1, -0.5)) * 0.6 * cellSize;
		const posZ = (pseudoRandom(1, -0.5)) * 0.6 * cellSize;

		mushroom.position.set(posX, 0, posZ);

		// Slight random rotation
		mushroom.rotation.y = pseudoRandom(Math.PI * 2);

		mushroomGroup.add(mushroom);
	}

	boardGroup.add(mushroomGroup);
}

/**
 * Add a chess piece to the scene
 * @param {Object} piece - The piece object
 * @param {string} playerId - The player ID who owns the piece
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {Object} The created piece mesh
 */
function addChessPiece(piece, playerId, x, z) {
	try {
		// Find player data
		const gameState = GameState.getGameState();
		const player = gameState.players ? gameState.players[playerId] : null;

		// If player not found, use a default color and log warning
		let pieceColor;
		if (!player) {
			console.warn(`Player ${playerId} not found for chess piece. Using default color.`);
			pieceColor = 0xCCCCCC; // Default gray color
		} else {
			pieceColor = player.color;
		}

		// Validate coordinates
		if (isNaN(x) || isNaN(z)) {
			console.warn(`Invalid coordinates for chess piece: x=${x}, z=${z}`);
			x = 0;
			z = 0;
		}

		// Create piece group
		const pieceGroup = new THREE.Group();

		// Get piece world position
		const yPos = getFloatingHeight(x, z) + 0.2; // Place slightly above the cell

		// Material based on player color
		const playerColor = new THREE.Color(pieceColor || 0xffffff);
		const colorHex = playerColor.getHex();

		// Create piece based on type
		let pieceGeometry;
		let pieceMaterial;

		// Create standard material for pieces
		pieceMaterial = new THREE.MeshStandardMaterial({
			color: playerColor,
			roughness: 0.5,
			metalness: 0.6
		});

		// Create appropriate geometry based on piece type
		switch (piece.type) {
			case 'pawn':
				pieceGeometry = new THREE.CylinderGeometry(0.2, 0.3, 0.5, 8);
				break;
			case 'rook':
				pieceGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.4);
				break;
			case 'knight':
				// Validate parameters for cone geometry
				const knightRadius = 0.25;
				const knightHeight = 0.6;
				pieceGeometry = new THREE.ConeGeometry(knightRadius, knightHeight, 5);
				break;
			case 'bishop':
				// Validate parameters for cone geometry
				const bishopRadius = 0.3;
				const bishopHeight = 0.7;
				pieceGeometry = new THREE.ConeGeometry(bishopRadius, bishopHeight, 8);
				break;
			case 'queen':
				pieceGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.7, 8);
				break;
			case 'king':
				pieceGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8);

				// Add a cross on top for the king
				const crossGeometry = new THREE.BoxGeometry(0.15, 0.3, 0.15);
				const crossMaterial = new THREE.MeshStandardMaterial({ color: playerColor });
				const cross = new THREE.Mesh(crossGeometry, crossMaterial);
				cross.position.y = 0.5;
				pieceGroup.add(cross);

				// Create a label for the king with player name
				const sessionData = SessionManager.getSessionData();
				if (player && gameState.players) {
					const playerName = player.username || `Player ${playerId.slice(0, 5)}`;
					createPlayerNameLabel(playerId, playerName, x, yPos + 1.5, z);
				}
				break;
			default:
				// Use a sphere for unknown pieces
				pieceGeometry = new THREE.SphereGeometry(0.3, 8, 8);
		}

		// Create the piece mesh
		const pieceMesh = new THREE.Mesh(pieceGeometry, pieceMaterial);
		pieceMesh.position.set(0, 0, 0);
		pieceGroup.add(pieceMesh);

		// Add glow effect to own pieces
		const sessionData = SessionManager.getSessionData();
		if (sessionData && playerId === sessionData.playerId) {
			const glowGeometry = new THREE.SphereGeometry(0.4, 16, 16);
			const glowMaterial = new THREE.MeshBasicMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0.3,
				blending: THREE.AdditiveBlending
			});
			const glow = new THREE.Mesh(glowGeometry, glowMaterial);
			pieceGroup.add(glow);
		}

		// Set position and add to the scene
		pieceGroup.position.set(x, yPos, z);
		piecesGroup.add(pieceGroup);

		return pieceGroup;
	} catch (error) {
		console.error('Error adding chess piece:', error);
		return null;
	}
}

/**
 * Create a player name label to display above their king
 * @param {string} playerId - The ID of the player
 * @param {string} playerName - The name to display
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} z - Z position
 * @returns {HTMLElement} The created label element
 */
function createPlayerNameLabel(playerId, playerName, x, y, z) {
	try {
		// Create a DOM element for the label
		const labelElement = document.createElement('div');
		labelElement.className = 'player-name-label';
		labelElement.textContent = playerName;
		labelElement.style.position = 'absolute';
		labelElement.style.color = '#ffffff';
		labelElement.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
		labelElement.style.padding = '3px 8px';
		labelElement.style.borderRadius = '4px';
		labelElement.style.fontFamily = 'Arial, sans-serif';
		labelElement.style.fontSize = '14px';
		labelElement.style.fontWeight = 'bold';
		labelElement.style.pointerEvents = 'none';
		labelElement.style.whiteSpace = 'nowrap';
		labelElement.style.zIndex = '1000';
		labelElement.style.transform = 'translate(-50%, -100%)';

		// Store position data for label updates
		labelElement.userData = {
			playerId: playerId,
			x: x,
			y: y,
			z: z
		};

		// Add to DOM and track in playerLabels array
		document.body.appendChild(labelElement);
		playerLabels.push(labelElement);

		return labelElement;
	} catch (error) {
		console.error('Error creating player name label:', error);
		return null;
	}
}

/**
 * Calculate a floating height value for a cell at a given position
 * Creates a subtle floating island effect
 * @param {number} x - X position on the board
 * @param {number} z - Z position on the board 
 * @returns {number} The calculated height for the position
 */
function getFloatingHeight(x, z) {
	// Add some gentle height variation based on position
	// This creates a subtle rolling hills effect
	if (isNaN(x) || isNaN(z)) {
		console.warn(`Invalid coordinates passed to getFloatingHeight: x=${x}, z=${z}`);
		return 0;
	}

	const baseHeight = 0;
	const variation = Math.sin(x * 0.5) * Math.cos(z * 0.5) * 0.2;

	const result = baseHeight + variation;

	// Validate result to avoid NaN propagation
	if (isNaN(result)) {
		console.warn(`getFloatingHeight calculated NaN: x=${x}, z=${z}, variation=${variation}`);
		return 0;
	}

	return result;
}

/**
 * Check if the player can make any chess moves
 * @returns {boolean} Whether the player can make any chess moves
 */
function canPlayerMakeChessMoves() {
	// Get the current player ID from the session
	const sessionData = SessionManager.getSessionData();
	const playerId = sessionData.playerId;

	// Get the current game state
	const gameState = GameState.getGameState();

	// If no game state or player, return false
	if (!gameState || !playerId) {
		return false;
	}

	// Get the player's pieces
	const playerPieces = [];
	gameState.board.forEach((row, y) => {
		row.forEach((cell, x) => {
			if (cell && cell.chessPiece && cell.playerId === playerId) {
				playerPieces.push({
					...cell.chessPiece,
					x,
					y
				});
			}
		});
	});

	// Check if any piece has valid moves
	for (const piece of playerPieces) {
		// Check surrounding cells for valid moves
		const directions = [
			{ dx: 0, dy: 1 },  // Up
			{ dx: 1, dy: 0 },  // Right
			{ dx: 0, dy: -1 }, // Down
			{ dx: -1, dy: 0 }, // Left
			{ dx: 1, dy: 1 },  // Up-Right
			{ dx: -1, dy: 1 }, // Up-Left
			{ dx: 1, dy: -1 }, // Down-Right
			{ dx: -1, dy: -1 }  // Down-Left
		];

		for (const dir of directions) {
			const targetX = piece.x + dir.dx;
			const targetY = piece.y + dir.dy;

			// Check if the target position is valid
			if (targetX >= 0 && targetX < gameState.board[0].length &&
				targetY >= 0 && targetY < gameState.board.length) {

				const targetCell = gameState.board[targetY][targetX];

				// If the cell is empty or has an opponent's piece, it's a valid move
				if (!targetCell || (targetCell && targetCell.playerId !== playerId)) {
					return true;
				}
			}
		}
	}

	return false;
}

/**
 * Validates geometry parameters to ensure they're not NaN or invalid values
 * @param {Object} params - The parameters to validate
 * @returns {Object} - The validated parameters
 */
function validateGeometryParams(params) {
	const validated = {};
	for (const key in params) {
		let value = params[key];
		if (isNaN(value) || value === undefined || value === null) {
			console.warn(`Invalid geometry parameter: ${key} = ${value}, using fallback`);
			value = key.includes('radius') ? 0.2 :
				key.includes('height') ? 0.5 :
					key.includes('width') ? 0.5 :
						key.includes('depth') ? 0.5 : 0.2;
		}
		validated[key] = value;
	}
	return validated;
}

export default {
	init,
	cleanup
}; 