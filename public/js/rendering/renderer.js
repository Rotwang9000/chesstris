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

// Three.js variables
let scene, camera, renderer, controls;
let boardGroup, piecesGroup, tetrominoGroup, uiGroup;

// Textures and materials
const textures = {};
const materials = {};

// Animation variables
let animationFrameId;
let lastRenderTime = 0;

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
		
		// Initialize game state if it doesn't exist
		const gameState = GameState.getGameState();
		if (!gameState || !gameState.board || !Array.isArray(gameState.board)) {
			console.log('Initializing default game state for rendering');
			// Initialize with an empty board (will be filled with null values)
			GameState.initGameState();
		} else {
			console.log('Using existing game state for rendering');
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
 * Update the board visualization
 */
function updateBoard() {
	// Clear existing board
	while (boardGroup.children.length > 0) {
		boardGroup.remove(boardGroup.children[0]);
	}
	
	const gameState = GameState.getGameState();
	if (!gameState || !gameState.board) {
		console.warn('No game state or board available for rendering');
		return;
	}
	
	if (!Array.isArray(gameState.board) || gameState.board.length === 0) {
		console.warn('Game board is empty or not an array');
		return;
	}
	
	// For empty rows, initialize board with default dimensions
	if (!gameState.board[0] || !Array.isArray(gameState.board[0])) {
		console.warn('First row of board is empty or not an array');
		return;
	}
	
	// In this game, there's no solid board - just floating cells
	// The board gets built up as tetris pieces are added
	
	// Create cells
	const cellSize = Constants.CELL_SIZE;
	const cellHeight = Constants.CELL_SIZE * 0.3; // Thicker cells for visibility
	const cellGeometry = new BoxGeometry(
		cellSize * 0.95,
		cellHeight,
		cellSize * 0.95
	);
	
	// Add all cells to the board
	try {
		// Count non-empty cells
		let nonEmptyCells = 0;
		
		gameState.board.forEach((row, y) => {
			if (!Array.isArray(row)) {
				console.warn(`Row ${y} is not an array, skipping`);
				return;
			}
			
			row.forEach((cell, x) => {
				if (!cell) return; // Skip empty (null) cells, this is normal
				
				nonEmptyCells++;
				
				// Create a floating island cell for each active cell
				createFloatingCell(cell, x, y, cellSize, cellGeometry);
			});
		});
		
		// Only log a warning if we find no active cells at all
		if (nonEmptyCells === 0) {
			console.log('Board initialized with all empty cells - waiting for game to start');
		} else {
			console.log(`Rendered ${nonEmptyCells} active cells`);
		}
	} catch (error) {
		console.error('Error rendering board cells:', error);
	}
}

/**
 * Create a floating cell with island-like appearance
 * @param {Object} cell - The cell data
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} cellSize - Size of each cell 
 * @param {Object} topGeometry - Geometry for the top of the cell
 */
function createFloatingCell(cell, x, y, cellSize, topGeometry) {
	// Get the game state
	const gameState = GameState.getGameState();
	
	// Calculate position
	const cellX = (x - (gameState.board[0].length - 1) / 2) * cellSize;
	const cellZ = (y - (gameState.board.length - 1) / 2) * cellSize;
	
	// Create the top flat part of the cell
	const cellMaterial = materials.cell.clone();
	const playerColor = cell.color || 0xCCCCCC;
	cellMaterial.color = new Color(playerColor);
	
	// If this is a home zone cell, use a different material
	if (cell.isHomeZone) {
		cellMaterial.opacity = 0.7;
		cellMaterial.transparent = true;
	}
	
	const cellMesh = new Mesh(topGeometry, cellMaterial);
	cellMesh.position.set(cellX, 0, cellZ);
	cellMesh.receiveShadow = true;
	cellMesh.castShadow = true;
	boardGroup.add(cellMesh);
	
	// Add bottom part for a floating island effect
	addCellBottom(cellX, cellZ, cellSize, playerColor);
	
	// Add potion if this cell has one
	if (cell.potion) {
		// Update the potion cell reference to include coordinates
		const potionCell = { ...cell, x, y };
		addPotionToCell(potionCell);
	}
	
	// Add decorative elements with low probability
	if (Math.random() > 0.8) {
		addCellDecoration(cellX, cellZ, cellSize);
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
 * Update chess pieces
 */
function updateChessPieces() {
	// Clear the pieces group
	while (piecesGroup.children.length > 0) {
		piecesGroup.remove(piecesGroup.children[0]);
	}
	
	const gameState = GameState.getGameState();
	
	// Add chess pieces for each player
	Object.values(gameState.players).forEach(player => {
		player.pieces.forEach(piece => {
			addChessPiece(piece, player);
		});
	});
}

/**
 * Add a chess piece to the scene
 * @param {Object} piece - The piece object
 * @param {Object} player - The player object
 */
function addChessPiece(piece, player) {
	// Determine piece geometry based on type
	let pieceGeometry;
	switch (piece.type) {
		case Constants.CHESS_PIECE_TYPES.PAWN:
			pieceGeometry = new CylinderGeometry(0.3, 0.4, 0.8, 8);
			break;
		case Constants.CHESS_PIECE_TYPES.ROOK:
			pieceGeometry = new BoxGeometry(0.6, 1, 0.6);
			break;
		case Constants.CHESS_PIECE_TYPES.KNIGHT:
			// Create a more complex knight shape
			const knightGroup = new Group();
			const baseGeometry = new CylinderGeometry(0.4, 0.5, 0.6, 8);
			const base = new Mesh(baseGeometry, new MeshStandardMaterial({ color: player.color }));
			base.position.y = 0.3;
			knightGroup.add(base);
			
			const headGeometry = new BoxGeometry(0.3, 0.5, 0.7);
			const head = new Mesh(headGeometry, new MeshStandardMaterial({ color: player.color }));
			head.position.set(0, 0.8, 0.1);
			head.rotation.x = Math.PI / 6;
			knightGroup.add(head);
			
			pieceGeometry = knightGroup;
			break;
		case Constants.CHESS_PIECE_TYPES.BISHOP:
			pieceGeometry = new ConeGeometry(0.4, 1.2, 8);
			break;
		case Constants.CHESS_PIECE_TYPES.QUEEN:
			pieceGeometry = new CylinderGeometry(0.3, 0.5, 1.3, 8);
			break;
		case Constants.CHESS_PIECE_TYPES.KING:
			// Create a more complex king shape
			const kingGroup = new Group();
			const kingBaseGeometry = new CylinderGeometry(0.4, 0.5, 1, 8);
			const kingBase = new Mesh(kingBaseGeometry, new MeshStandardMaterial({ color: player.color }));
			kingBase.position.y = 0.5;
			kingGroup.add(kingBase);
			
			const crownGeometry = new BoxGeometry(0.8, 0.3, 0.8);
			const crown = new Mesh(crownGeometry, new MeshStandardMaterial({ color: player.color }));
			crown.position.y = 1.15;
			kingGroup.add(crown);
			
			const crossGeometry = new BoxGeometry(0.2, 0.4, 0.2);
			const cross = new Mesh(crossGeometry, new MeshStandardMaterial({ color: player.color }));
			cross.position.y = 1.5;
			kingGroup.add(cross);
			
			pieceGeometry = kingGroup;
			break;
		default:
			// Default to pawn
			pieceGeometry = new BoxGeometry(0.5, 0.5, 0.5);
			break;
	}
	
	// Check if we need a simple or complex mesh
	let pieceMesh;
	if (pieceGeometry instanceof Group) {
		pieceMesh = pieceGeometry;
	} else {
		const pieceMaterial = new MeshStandardMaterial({
			color: player.color,
			roughness: 0.6,
			metalness: 0.3
		});
		pieceMesh = new Mesh(pieceGeometry, pieceMaterial);
	}
	
	// Position the piece
	pieceMesh.position.set(
		piece.x * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_WIDTH * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2,
		Constants.CELL_HEIGHT + (piece.type === Constants.CHESS_PIECE_TYPES.KING ? 0.65 : 0.4),
		piece.y * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_HEIGHT * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2
	);
	
	pieceMesh.castShadow = true;
	pieceMesh.userData.piece = piece;
	
	piecesGroup.add(pieceMesh);
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
		const piece = addChessPiece(fallingPiece.chessPiece, materials.chessPieceWhite);
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
 * Add a bottom part to a cell to create a floating island effect
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} cellSize - Size of the cell
 * @param {number} color - Color of the cell (player color)
 */
function addCellBottom(x, z, cellSize, color) {
	// Create the bottom part of the cell
	const bottomDepth = cellSize * 1.5; // Deeper than the top
	
	// Create a slightly smaller bottom to give a ledge effect
	const bottomWidth = cellSize * 0.85;
	const bottomGeometry = new BoxGeometry(
		bottomWidth,
		bottomDepth,
		bottomWidth
	);
	
	// Create a slightly darker version of the cell color for the bottom
	const bottomColor = new Color(color).multiplyScalar(0.8);
	
	const bottomMaterial = new MeshStandardMaterial({
		color: bottomColor,
		roughness: 0.9,
		metalness: 0.1
	});
	
	const bottomMesh = new Mesh(bottomGeometry, bottomMaterial);
	bottomMesh.position.set(x, -bottomDepth / 2 - 0.15, z);
	bottomMesh.receiveShadow = true;
	bottomMesh.castShadow = true;
	boardGroup.add(bottomMesh);
	
	// Add a small hanging "stalactite" with low probability
	if (Math.random() > 0.7) {
		const stalactiteHeight = Math.random() * cellSize + cellSize * 0.5;
		const stalactiteRadius = Math.random() * (cellSize * 0.15) + cellSize * 0.05;
		
		const stalactiteGeometry = new CylinderGeometry(
			stalactiteRadius * 0.2, // Narrow at the bottom
			stalactiteRadius,       // Wider at the top
			stalactiteHeight,
			6
		);
		
		const stalactiteMaterial = new MeshStandardMaterial({
			color: bottomColor.clone().multiplyScalar(0.7), // Even darker
			roughness: 0.9,
			metalness: 0.05
		});
		
		const stalactiteMesh = new Mesh(stalactiteGeometry, stalactiteMaterial);
		stalactiteMesh.position.set(
			x + (Math.random() - 0.5) * cellSize * 0.4,
			-stalactiteHeight / 2 - bottomDepth - 0.15,
			z + (Math.random() - 0.5) * cellSize * 0.4
		);
		
		stalactiteMesh.receiveShadow = true;
		stalactiteMesh.castShadow = true;
		boardGroup.add(stalactiteMesh);
	}
}

/**
 * Add decorative elements to a cell
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} cellSize - Size of the cell
 */
function addCellDecoration(x, z, cellSize) {
	// Choose decoration type: 1=stone, 2=grass, 3=mushroom
	const decorationType = Math.floor(Math.random() * 3) + 1;
	
	switch (decorationType) {
		case 1: // Stone
			addStoneDecoration(x, z, cellSize);
			break;
		case 2: // Grass tuft
			addGrassTuft(x, z, cellSize * 0.4);
			break;
		case 3: // Mushroom
			addMushroomDecoration(x, z, cellSize);
			break;
	}
}

/**
 * Add a small stone decoration to a cell
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} cellSize - Size of the cell
 */
function addStoneDecoration(x, z, cellSize) {
	const stoneRadius = Math.random() * (cellSize * 0.15) + cellSize * 0.05;
	const stoneGeometry = new SphereGeometry(stoneRadius, 6, 4);
	
	const stoneMaterial = new MeshStandardMaterial({
		color: new Color(0xAAAAAA).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2),
		roughness: 0.8,
		metalness: 0.2
	});
	
	const stoneMesh = new Mesh(stoneGeometry, stoneMaterial);
	stoneMesh.position.set(
		x + (Math.random() - 0.5) * cellSize * 0.6,
		stoneRadius * 0.5,
		z + (Math.random() - 0.5) * cellSize * 0.6
	);
	
	// Deform the stone slightly
	stoneMesh.scale.set(
		1 + Math.random() * 0.4,
		0.5 + Math.random() * 0.3,
		1 + Math.random() * 0.4
	);
	
	stoneMesh.rotation.y = Math.random() * Math.PI;
	stoneMesh.receiveShadow = true;
	stoneMesh.castShadow = true;
	boardGroup.add(stoneMesh);
}

/**
 * Add a mushroom decoration to a cell
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} cellSize - Size of the cell
 */
function addMushroomDecoration(x, z, cellSize) {
	// Create stem
	const stemHeight = cellSize * (0.2 + Math.random() * 0.15);
	const stemRadius = cellSize * (0.02 + Math.random() * 0.02);
	const stemGeometry = new CylinderGeometry(stemRadius, stemRadius, stemHeight, 8);
	const stemMaterial = new MeshStandardMaterial({
		color: 0xECEFEF,
		roughness: 0.7,
		metalness: 0.1
	});
	
	const stemMesh = new Mesh(stemGeometry, stemMaterial);
	
	// Position with some randomness
	const mushX = x + (Math.random() - 0.5) * cellSize * 0.6;
	const mushZ = z + (Math.random() - 0.5) * cellSize * 0.6;
	
	stemMesh.position.set(mushX, stemHeight / 2, mushZ);
	stemMesh.receiveShadow = true;
	stemMesh.castShadow = true;
	boardGroup.add(stemMesh);
	
	// Create cap
	const capRadius = stemRadius * (2.5 + Math.random() * 1.5);
	const capHeight = stemHeight * (0.3 + Math.random() * 0.2);
	const capGeometry = new SphereGeometry(capRadius, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
	
	// Choose from a few mushroom cap colors
	const capColors = [0xE53935, 0x4CAF50, 0xFFC107, 0x42A5F5];
	const capColor = capColors[Math.floor(Math.random() * capColors.length)];
	
	const capMaterial = new MeshStandardMaterial({
		color: capColor,
		roughness: 0.8,
		metalness: 0.1
	});
	
	const capMesh = new Mesh(capGeometry, capMaterial);
	capMesh.position.set(mushX, stemHeight, mushZ);
	capMesh.rotation.x = Math.PI; // Flip to get the dome shape facing up
	capMesh.receiveShadow = true;
	capMesh.castShadow = true;
	boardGroup.add(capMesh);
	
	// Add small white dots on red caps
	if (capColor === 0xE53935 && Math.random() > 0.5) {
		const dotCount = Math.floor(Math.random() * 5) + 3;
		
		for (let i = 0; i < dotCount; i++) {
			const dotSize = capRadius * (0.1 + Math.random() * 0.1);
			const dotGeometry = new SphereGeometry(dotSize, 4, 4);
			const dotMaterial = new MeshStandardMaterial({
				color: 0xFFFFFF,
				roughness: 0.7,
				metalness: 0.1
			});
			
			const dotMesh = new Mesh(dotGeometry, dotMaterial);
			
			// Position on the cap surface
			const angle = Math.random() * Math.PI * 2;
			const distance = Math.random() * capRadius * 0.6;
			
			dotMesh.position.set(
				mushX + Math.cos(angle) * distance,
				stemHeight + capHeight * 0.5,
				mushZ + Math.sin(angle) * distance
			);
			
			dotMesh.receiveShadow = true;
			dotMesh.castShadow = true;
			boardGroup.add(dotMesh);
		}
	}
}

export default {
	init,
	cleanup
}; 