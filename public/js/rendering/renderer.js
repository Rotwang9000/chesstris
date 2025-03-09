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
	const textureLoader = new TextureLoader();
	
	// Create materials with fallback colors in case textures are missing
	materials.board = new MeshStandardMaterial({
		color: 0x333333,
		roughness: 0.8,
		metalness: 0.2
	});
	
	materials.cell = new MeshStandardMaterial({
		color: 0x555555,
		roughness: 0.5,
		metalness: 0.1
	});
	
	materials.homeZone = new MeshStandardMaterial({
		color: 0x444444,
		transparent: true,
		opacity: 0.8
	});
	
	// Chess piece materials
	materials.chessPieceWhite = new MeshStandardMaterial({
		color: 0xFFFFFF,
		roughness: 0.5,
		metalness: 0.1
	});
	
	materials.chessPieceBlack = new MeshStandardMaterial({
		color: 0x333333,
		roughness: 0.5,
		metalness: 0.1
	});
	
	// Create tetromino materials for each type
	// Use the keys from TETROMINO_COLORS instead of TETROMINO_TYPES
	Object.keys(Constants.TETROMINO_COLORS).forEach(type => {
		const color = Constants.TETROMINO_COLORS[type];
		materials[`tetromino_${type}`] = new MeshStandardMaterial({
			color: new Color(color),
			roughness: 0.7,
			metalness: 0.3
		});
	});
	
	// Try to load textures in the background, but don't rely on them
	try {
		// Load board textures
		textureLoader.load('/assets/textures/board.png', 
			texture => { materials.board.map = texture; materials.board.needsUpdate = true; },
			undefined,
			error => console.warn('Failed to load board texture:', error)
		);
		
		textureLoader.load('/assets/textures/cell.png', 
			texture => { materials.cell.map = texture; materials.cell.needsUpdate = true; },
			undefined,
			error => console.warn('Failed to load cell texture:', error)
		);
		
		textureLoader.load('/assets/textures/home_zone.png', 
			texture => { materials.homeZone.map = texture; materials.homeZone.needsUpdate = true; },
			undefined,
			error => console.warn('Failed to load home zone texture:', error)
		);
	} catch (error) {
		console.warn('Error loading textures:', error);
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
	try {
		// Clear existing board elements
		while (boardGroup.children.length > 0) {
			boardGroup.remove(boardGroup.children[0]);
		}
		
		// Get the current game state
		const gameState = GameState.getGameState();
		if (!gameState || !gameState.board) {
			console.warn('No game state or board available');
			return;
		}
		
		// Check if the board is a valid 2D array
		if (!Array.isArray(gameState.board) || gameState.board.length === 0) {
			console.warn('Game board is not a valid array');
			return;
		}
		
		// Check if the first row is a valid array
		if (!gameState.board[0] || !Array.isArray(gameState.board[0])) {
			console.warn('Game board rows are not valid arrays');
			return;
		}
		
		// Create cell geometry (reusable for all cells)
		const cellSize = 1;
		const topGeometry = new BoxGeometry(cellSize, 0.1, cellSize);
		
		// Track active cells for debugging
		let activeCellCount = 0;
		
		// Render only active cells
		gameState.board.forEach((row, z) => {
			row.forEach((cell, x) => {
				// Skip empty cells
				if (!cell || !cell.type) return;
				
				// Create a floating cell for this position
				const cellGroup = createFloatingCell(cell, x, z, cellSize, topGeometry);
				
				if (cellGroup) {
					boardGroup.add(cellGroup);
					activeCellCount++;
				}
			});
		});
		
		console.log(`Rendered ${activeCellCount} active cells`);
	} catch (error) {
		console.error('Error updating board:', error);
	}
}

/**
 * Create a floating cell with top and bottom parts
 * @param {Object} cell - Cell data
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} cellSize - Size of the cell
 * @param {Object} topGeometry - Geometry for the top part
 * @returns {Group} Cell group
 */
function createFloatingCell(cell, x, z, cellSize, topGeometry) {
	try {
		const gameState = GameState.getGameState();
		
		// Create a normalized position from the board coordinates
		// This centers the board so (0,0) is at the center
		const boardWidth = gameState.board[0].length;
		const boardHeight = gameState.board.length;
		const centerX = (boardWidth - 1) / 2;
		const centerZ = (boardHeight - 1) / 2;
		
		const normalizedX = (x - centerX) * cellSize;
		const normalizedZ = (z - centerZ) * cellSize;
		
		// Get the floating height for this cell
		const cellY = getFloatingHeight(x, z);
		
		// Create a group for the cell
		const cellGroup = new Group();
		cellGroup.name = `cell_${x}_${z}`;
		cellGroup.position.set(normalizedX, cellY, normalizedZ);
		
		// Get the appropriate cell color based on cell data
		let cellColor;
		
		if (cell.player && gameState.players[cell.player]) {
			// Use player color
			cellColor = new Color(gameState.players[cell.player].color);
		} else if (cell.type === 'home_zone') {
			// Default home zone color
			cellColor = new Color(0x8e44ad); // Purple
		} else if (cell.type === 'tetris') {
			// Tetris piece color
			cellColor = new Color(0x2ecc71); // Green
		} else {
			// Default cell color
			cellColor = new Color(0xecf0f1); // Light gray
		}
		
		// Create the top part of the cell
		const topMaterial = new MeshStandardMaterial({
			color: cellColor,
			roughness: 0.7,
			metalness: 0.2
		});
		
		const topMesh = new Mesh(topGeometry, topMaterial);
		topMesh.position.y = 0;
		cellGroup.add(topMesh);
		
		// Add a bottom part (stalactite-like structure) to the cell
		addCellBottom(x, z, cellSize, cellColor);
		
		// Randomly add decorations to the cell
		if (Math.random() < 0.7) {
			addCellDecoration(x, z, cellSize);
		}
		
		// If this cell has a potion, add it
		if (cell.potion) {
			addPotionToCell(cell);
		}
		
		return cellGroup;
	} catch (error) {
		console.error('Error creating floating cell:', error);
		return null;
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
 * Add a small tuft of grass
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} radius - Approximate radius of the tuft
 */
function addGrassTuft(x, z, radius) {
	const bladeCount = Math.floor(Math.random() * 5) + 3;
	
	for (let i = 0; i < bladeCount; i++) {
		// Create a single blade of grass
		const bladeHeight = Math.random() * (Constants.CELL_SIZE * 0.6) + Constants.CELL_SIZE * 0.3;
		const bladeWidth = Math.random() * (Constants.CELL_SIZE * 0.1) + Constants.CELL_SIZE * 0.03;
		const bladeGeometry = new PlaneGeometry(bladeWidth, bladeHeight);
		
		// Random shade of green
		const bladeColor = new Color(0x4CAF50).offsetHSL(
			(Math.random() - 0.5) * 0.1,  // Slight hue variation
			Math.random() * 0.2,          // Saturation variation
			(Math.random() - 0.5) * 0.2   // Lightness variation
		);
		
		const bladeMaterial = new MeshBasicMaterial({
			color: bladeColor,
			transparent: true,
			opacity: 0.9,
			side: DoubleSide
		});
		
		const blade = new Mesh(bladeGeometry, bladeMaterial);
		
		// Position with some randomness
		const offsetX = (Math.random() - 0.5) * radius * 1.5;
		const offsetZ = (Math.random() - 0.5) * radius * 1.5;
		
		blade.position.set(
			x + offsetX,
			bladeHeight / 2,
			z + offsetZ
		);
		
		// Rotate to create a tuft effect
		const rotationY = Math.atan2(offsetZ, offsetX);
		blade.rotation.set(
			(Math.random() - 0.5) * 0.3,
			rotationY,
			(Math.random() - 0.5) * 0.3
		);
		
		boardGroup.add(blade);
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
	try {
		// Clear all existing pieces
		while (piecesGroup.children.length > 0) {
			piecesGroup.remove(piecesGroup.children[0]);
		}
		
		// Get the current game state
		const gameState = GameState.getGameState();
		if (!gameState || !gameState.board) return;
		
		const board = gameState.board;
		let piecesAdded = 0;
		
		// Iterate through the board
		for (let z = 0; z < board.length; z++) {
			for (let x = 0; x < board[z].length; x++) {
				const cell = board[z][x];
				
				// Skip empty cells
				if (!cell || !cell.type) continue;
				
				// Skip cells that don't have chess pieces
				if (!cell.chessPiece) continue;
				
				// Add the chess piece
				const piece = cell.chessPiece;
				const result = addChessPiece(piece, piece.player, x, z);
				if (result) piecesAdded++;
			}
		}
		
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
	// This would update any 3D UI elements
	// For now, we'll leave it empty as UI is typically handled in HTML/CSS
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
		const gameState = GameState.getGameState();
		
		// Create a normalized position from the board coordinates
		// This centers the board so (0,0) is at the center
		const boardWidth = gameState.board[0].length;
		const boardHeight = gameState.board.length;
		const centerX = (boardWidth - 1) / 2;
		const centerZ = (boardHeight - 1) / 2;
		
		const normalizedX = (x - centerX) * cellSize;
		const normalizedZ = (z - centerZ) * cellSize;
		
		// Get the floating height for this cell
		const cellY = getFloatingHeight(x, z);
		
		// Create a material for the bottom part
		const bottomColor = new Color(color).multiplyScalar(0.7); // Darker version of cell color
		const bottomMaterial = new MeshStandardMaterial({
			color: bottomColor,
			roughness: 0.9,
			metalness: 0.1
		});
		
		// Create a group for the bottom part
		const bottomGroup = new Group();
		bottomGroup.position.set(normalizedX, cellY, normalizedZ);
		
		// Create a shorter, narrower stalactite-like structure
		const height = 0.5 + Math.random() * 0.5; // Variable height
		const topWidth = cellSize * 0.9;
		const bottomWidth = cellSize * 0.3; // Narrower at the bottom
		
		// Create a pyramid-like shape for the bottom
		const bottomGeometry = new CylinderGeometry(
			bottomWidth / 2, // Top radius (narrower)
			0.05, // Bottom radius (very narrow point)
			height, // Height of the stalactite
			5 // Lower polygon count for performance
		);
		
		// Position it below the cell
		const bottomMesh = new Mesh(bottomGeometry, bottomMaterial);
		bottomMesh.position.y = -height / 2;
		bottomMesh.castShadow = true;
		bottomGroup.add(bottomMesh);
		
		// Add some small details to make it more interesting
		if (Math.random() > 0.5) {
			// Add a small secondary stalactite
			const smallHeight = height * 0.6;
			const smallGeometry = new CylinderGeometry(
				bottomWidth / 3,
				0.02,
				smallHeight,
				4
			);
			
			const smallMesh = new Mesh(smallGeometry, bottomMaterial);
			// Position it randomly offset from the center
			smallMesh.position.set(
				(Math.random() - 0.5) * 0.2,
				-height * 0.7,
				(Math.random() - 0.5) * 0.2
			);
			// Random slight tilt
			smallMesh.rotation.x = (Math.random() - 0.5) * 0.2;
			smallMesh.rotation.z = (Math.random() - 0.5) * 0.2;
			bottomGroup.add(smallMesh);
		}
		
		// Add the bottom group to the board
		boardGroup.add(bottomGroup);
	} catch (error) {
		console.error('Error adding cell bottom:', error);
	}
}

/**
 * Add a decorative element to a cell
 * @param {number} x - X position
 * @param {number} z - Z position 
 * @param {number} cellSize - Size of the cell
 */
function addCellDecoration(x, z, cellSize) {
	try {
		const gameState = GameState.getGameState();
		
		// Create a normalized position from the board coordinates
		// This centers the board so (0,0) is at the center
		const boardWidth = gameState.board[0].length;
		const boardHeight = gameState.board.length;
		const centerX = (boardWidth - 1) / 2;
		const centerZ = (boardHeight - 1) / 2;
		
		const normalizedX = (x - centerX) * cellSize;
		const normalizedZ = (z - centerZ) * cellSize;
		
		// Get the floating height for this cell
		const cellY = getFloatingHeight(x, z);
		
		// Choose a random decoration type
		const decorationType = Math.random();
		
		if (decorationType < 0.4) {
			// Stone decorations
			addStoneDecoration(normalizedX, normalizedZ, cellY, cellSize);
		} else if (decorationType < 0.7) {
			// Grass tufts
			addGrassTuft(normalizedX, normalizedZ, cellY, cellSize);
		} else {
			// Mushroom decorations
			addMushroomDecoration(normalizedX, normalizedZ, cellY, cellSize);
		}
	} catch (error) {
		console.error('Error adding cell decoration:', error);
	}
}

/**
 * Add stone decoration to a cell
 * @param {number} x - Normalized X position
 * @param {number} z - Normalized Z position
 * @param {number} y - Y position (height)
 * @param {number} cellSize - Size of the cell
 */
function addStoneDecoration(x, z, y, cellSize) {
	// Create a small group of stones
	const stoneGroup = new Group();
	stoneGroup.position.set(x, y, z);
	
	// Random number of stones (1-3)
	const stoneCount = Math.floor(Math.random() * 3) + 1;
	
	for (let i = 0; i < stoneCount; i++) {
		// Create a random stone shape
		const stoneSize = Math.random() * 0.15 + 0.05;
		const stoneGeometry = new SphereGeometry(stoneSize, 4, 4);
		
		// Create a gray material with random shade
		const stoneBrightness = Math.random() * 0.2 + 0.4; // 0.4-0.6 range
		const stoneMaterial = new MeshStandardMaterial({
			color: new Color(stoneBrightness, stoneBrightness, stoneBrightness),
			roughness: 0.9,
			metalness: 0.1
		});
		
		const stone = new Mesh(stoneGeometry, stoneMaterial);
		
		// Position randomly on the cell
		const posX = (Math.random() - 0.5) * 0.6 * cellSize;
		const posZ = (Math.random() - 0.5) * 0.6 * cellSize;
		
		stone.position.set(posX, 0.05 + stoneSize * 0.5, posZ);
		
		// Apply random rotation
		stone.rotation.set(
			Math.random() * Math.PI,
			Math.random() * Math.PI,
			Math.random() * Math.PI
		);
		
		stoneGroup.add(stone);
	}
	
	boardGroup.add(stoneGroup);
}

/**
 * Add grass tufts to a cell
 * @param {number} x - Normalized X position
 * @param {number} z - Normalized Z position
 * @param {number} y - Y position (height) 
 * @param {number} cellSize - Size of the cell
 */
function addGrassTuft(x, z, y, cellSize) {
	// Create a group for the grass
	const grassGroup = new Group();
	grassGroup.position.set(x, y, z);
	
	// Random number of grass tufts
	const tuftsCount = Math.floor(Math.random() * 5) + 3;
	
	for (let i = 0; i < tuftsCount; i++) {
		// Create a single blade of grass
		const height = Math.random() * 0.2 + 0.1;
		const width = 0.03 + Math.random() * 0.02;
		
		const grassGeometry = new PlaneGeometry(width, height);
		
		// Create a green material with random shade
		const greenValue = Math.random() * 0.4 + 0.3; // 0.3-0.7 range
		const grassMaterial = new MeshBasicMaterial({
			color: new Color(0.1, greenValue, 0.1),
			side: DoubleSide,
			transparent: true
		});
		
		const grassBlade = new Mesh(grassGeometry, grassMaterial);
		
		// Position randomly on the cell
		const posX = (Math.random() - 0.5) * 0.7 * cellSize;
		const posZ = (Math.random() - 0.5) * 0.7 * cellSize;
		
		grassBlade.position.set(posX, height * 0.5, posZ);
		
		// Random rotation around Y axis
		grassBlade.rotation.y = Math.random() * Math.PI;
		
		// Slight lean in random direction
		grassBlade.rotation.x = (Math.random() - 0.5) * 0.2;
		grassBlade.rotation.z = (Math.random() - 0.5) * 0.2;
		
		grassGroup.add(grassBlade);
	}
	
	boardGroup.add(grassGroup);
}

/**
 * Add mushroom decoration to a cell
 * @param {number} x - Normalized X position
 * @param {number} z - Normalized Z position
 * @param {number} y - Y position (height)
 * @param {number} cellSize - Size of the cell
 */
function addMushroomDecoration(x, z, y, cellSize) {
	// Create a group for the mushrooms
	const mushroomGroup = new Group();
	mushroomGroup.position.set(x, y, z);
	
	// Random number of mushrooms (1-3)
	const mushroomCount = Math.floor(Math.random() * 2) + 1;
	
	for (let i = 0; i < mushroomCount; i++) {
		// Create a mushroom group
		const mushroom = new Group();
		
		// Random size
		const scale = Math.random() * 0.5 + 0.5;
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
		
		// Choose a random mushroom color
		let capColor;
		if (Math.random() > 0.5) {
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
		const posX = (Math.random() - 0.5) * 0.6 * cellSize;
		const posZ = (Math.random() - 0.5) * 0.6 * cellSize;
		
		mushroom.position.set(posX, 0, posZ);
		
		// Slight random rotation
		mushroom.rotation.y = Math.random() * Math.PI * 2;
		
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
		const gameState = GameState.getGameState();
		if (!gameState || !gameState.players) return null;
		
		// Get player data
		const player = gameState.players[playerId];
		if (!player) {
			console.warn(`Player ${playerId} not found for chess piece`);
			return null;
		}
		
		// Create a group for the piece
		const pieceGroup = new Group();
		pieceGroup.name = `piece_${piece.type}_${playerId}_${x}_${z}`;
		
		// Calculate position
		const cellSize = 1; // Default cell size
		const yOffset = 0.25; // Height above the cell
		
		// Create a normalized position from the board coordinates
		// This centers the board so (0,0) is at the center
		const boardWidth = gameState.board[0].length;
		const boardHeight = gameState.board.length;
		const centerX = (boardWidth - 1) / 2;
		const centerZ = (boardHeight - 1) / 2;
		
		const normalizedX = (x - centerX) * cellSize;
		const normalizedZ = (z - centerZ) * cellSize;
		
		// Get the floating height for this cell position
		const cellY = getFloatingHeight(x, z);
		
		// Position the piece
		pieceGroup.position.set(
			normalizedX,
			cellY + yOffset, // Position above the cell
			normalizedZ
		);
		
		// Create a material based on player color
		const playerColor = new Color(player.color || 0xffffff);
		const darkened = playerColor.clone().multiplyScalar(0.7);
		
		const baseMaterial = new MeshStandardMaterial({
			color: playerColor,
			roughness: 0.7,
			metalness: 0.3
		});
		
		const darkMaterial = new MeshStandardMaterial({
			color: darkened,
			roughness: 0.7,
			metalness: 0.3
		});
		
		// Create the appropriate geometry based on piece type
		let pieceGeometry;
		let pieceMesh;
		
		switch (piece.type.toLowerCase()) {
			case 'pawn':
				// Create pawn geometry - simple cylinder with sphere on top
				const pawnBase = new CylinderGeometry(0.2, 0.25, 0.5, 8);
				const pawnBaseMesh = new Mesh(pawnBase, baseMaterial);
				pawnBaseMesh.position.y = 0.25;
				pieceGroup.add(pawnBaseMesh);
				
				const pawnHead = new SphereGeometry(0.18, 8, 8);
				const pawnHeadMesh = new Mesh(pawnHead, baseMaterial);
				pawnHeadMesh.position.y = 0.6;
				pieceGroup.add(pawnHeadMesh);
				break;
				
			case 'rook':
				// Create rook geometry - rectangular prism with battlements
				const rookBase = new BoxGeometry(0.4, 0.6, 0.4);
				const rookBaseMesh = new Mesh(rookBase, baseMaterial);
				rookBaseMesh.position.y = 0.3;
				pieceGroup.add(rookBaseMesh);
				
				// Top battlements
				const rookTop = new BoxGeometry(0.5, 0.15, 0.5);
				const rookTopMesh = new Mesh(rookTop, darkMaterial);
				rookTopMesh.position.y = 0.675;
				pieceGroup.add(rookTopMesh);
				
				// Corner battlements
				[-1, 1].forEach(xPos => {
					[-1, 1].forEach(zPos => {
						const cornerGeometry = new BoxGeometry(0.1, 0.1, 0.1);
						const cornerMesh = new Mesh(cornerGeometry, darkMaterial);
						cornerMesh.position.set(xPos * 0.2, 0.8, zPos * 0.2);
						pieceGroup.add(cornerMesh);
					});
				});
				break;
				
			case 'knight':
				// Create knight geometry - base with angled head
				const knightBase = new CylinderGeometry(0.25, 0.3, 0.3, 8);
				const knightBaseMesh = new Mesh(knightBase, baseMaterial);
				knightBaseMesh.position.y = 0.15;
				pieceGroup.add(knightBaseMesh);
				
				// Knight neck
				const knightNeck = new BoxGeometry(0.25, 0.4, 0.25);
				const knightNeckMesh = new Mesh(knightNeck, baseMaterial);
				knightNeckMesh.position.set(0, 0.45, 0);
				pieceGroup.add(knightNeckMesh);
				
				// Knight head
				const knightHead = new BoxGeometry(0.3, 0.25, 0.5);
				const knightHeadMesh = new Mesh(knightHead, darkMaterial);
				knightHeadMesh.position.set(0, 0.75, 0.1);
				knightHeadMesh.rotation.x = Math.PI / 8;
				pieceGroup.add(knightHeadMesh);
				
				// Knight ears/horns
				const earGeometry = new ConeGeometry(0.1, 0.2, 4);
				
				const leftEar = new Mesh(earGeometry, darkMaterial);
				leftEar.position.set(-0.15, 0.85, 0);
				leftEar.rotation.z = -Math.PI / 6;
				pieceGroup.add(leftEar);
				
				const rightEar = new Mesh(earGeometry, darkMaterial);
				rightEar.position.set(0.15, 0.85, 0);
				rightEar.rotation.z = Math.PI / 6;
				pieceGroup.add(rightEar);
				break;
				
			case 'bishop':
				// Create bishop geometry - base with pointed top
				const bishopBase = new CylinderGeometry(0.25, 0.3, 0.5, 8);
				const bishopBaseMesh = new Mesh(bishopBase, baseMaterial);
				bishopBaseMesh.position.y = 0.25;
				pieceGroup.add(bishopBaseMesh);
				
				const bishopMiddle = new SphereGeometry(0.2, 8, 8);
				const bishopMiddleMesh = new Mesh(bishopMiddle, baseMaterial);
				bishopMiddleMesh.position.y = 0.6;
				pieceGroup.add(bishopMiddleMesh);
				
				const bishopTop = new ConeGeometry(0.1, 0.3, 8);
				const bishopTopMesh = new Mesh(bishopTop, darkMaterial);
				bishopTopMesh.position.y = 0.85;
				pieceGroup.add(bishopTopMesh);
				break;
				
			case 'queen':
				// Create queen geometry - elegant with crown
				const queenBase = new CylinderGeometry(0.3, 0.35, 0.5, 8);
				const queenBaseMesh = new Mesh(queenBase, baseMaterial);
				queenBaseMesh.position.y = 0.25;
				pieceGroup.add(queenBaseMesh);
				
				const queenMiddle = new SphereGeometry(0.25, 8, 8);
				const queenMiddleMesh = new Mesh(queenMiddle, baseMaterial);
				queenMiddleMesh.position.y = 0.6;
				pieceGroup.add(queenMiddleMesh);
				
				const crownGeometry = new CylinderGeometry(0.3, 0.2, 0.2, 8);
				const crownMesh = new Mesh(crownGeometry, darkMaterial);
				crownMesh.position.y = 0.85;
				pieceGroup.add(crownMesh);
				
				// Add points to the crown
				for (let i = 0; i < 5; i++) {
					const angle = (i / 5) * Math.PI * 2;
					const pointGeometry = new ConeGeometry(0.05, 0.15, 4);
					const pointMesh = new Mesh(pointGeometry, darkMaterial);
					pointMesh.position.set(
						Math.sin(angle) * 0.2,
						1,
						Math.cos(angle) * 0.2
					);
					pieceGroup.add(pointMesh);
				}
				break;
				
			case 'king':
				// Create king geometry - majestic with crown and cross
				const kingBase = new CylinderGeometry(0.3, 0.35, 0.5, 8);
				const kingBaseMesh = new Mesh(kingBase, baseMaterial);
				kingBaseMesh.position.y = 0.25;
				pieceGroup.add(kingBaseMesh);
				
				const kingMiddle = new SphereGeometry(0.25, 8, 8);
				const kingMiddleMesh = new Mesh(kingMiddle, baseMaterial);
				kingMiddleMesh.position.y = 0.6;
				pieceGroup.add(kingMiddleMesh);
				
				const kingCrownGeometry = new CylinderGeometry(0.3, 0.2, 0.2, 8);
				const kingCrownMesh = new Mesh(kingCrownGeometry, darkMaterial);
				kingCrownMesh.position.y = 0.85;
				pieceGroup.add(kingCrownMesh);
				
				// Cross on top
				const crossVerticalGeometry = new BoxGeometry(0.08, 0.3, 0.08);
				const crossVerticalMesh = new Mesh(crossVerticalGeometry, darkMaterial);
				crossVerticalMesh.position.y = 1.1;
				pieceGroup.add(crossVerticalMesh);
				
				const crossHorizontalGeometry = new BoxGeometry(0.25, 0.08, 0.08);
				const crossHorizontalMesh = new Mesh(crossHorizontalGeometry, darkMaterial);
				crossHorizontalMesh.position.y = 1.05;
				pieceGroup.add(crossHorizontalMesh);
				
				// Add a player name label above the king
				createPlayerNameLabel(playerId, player.name || `Player ${playerId}`, pieceGroup.position.x, pieceGroup.position.y + 1.5, pieceGroup.position.z);
				break;
				
			default:
				// Default fallback - simple cube
				pieceGeometry = new BoxGeometry(0.4, 0.4, 0.4);
				pieceMesh = new Mesh(pieceGeometry, baseMaterial);
				pieceMesh.position.y = 0.2;
				pieceGroup.add(pieceMesh);
				break;
		}
		
		// Add a subtle glow effect
		const glowGeometry = new SphereGeometry(0.4, 8, 8);
		const glowMaterial = new MeshBasicMaterial({
			color: playerColor,
			transparent: true,
			opacity: 0.2,
			side: DoubleSide
		});
		const glowMesh = new Mesh(glowGeometry, glowMaterial);
		glowMesh.position.y = 0.4;
		pieceGroup.add(glowMesh);
		
		// Add piece to the scene
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
	// Use a simple sine wave pattern to create floating effect
	// This makes cells have different heights based on position
	const baseHeight = 0;
	const floatAmplitude = 0.2; // How much height varies
	
	// Convert board positions to world space for better wave pattern
	const worldX = x * 1.0; // Multiply by cell size
	const worldZ = z * 1.0;
	
	// Create a natural-looking height pattern using sine waves
	// Different frequencies create a more organic look
	const height = baseHeight + 
		floatAmplitude * 0.7 * Math.sin(worldX * 0.5 + worldZ * 0.3) + 
		floatAmplitude * 0.3 * Math.sin(worldX * 0.2 - worldZ * 0.7);
	
	return height;
}

export default {
	init,
	cleanup
}; 