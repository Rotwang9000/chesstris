﻿/**
 * Shaktris Enhanced Game Core
 * 
 * A visually improved version of the game with Russian historical themes.
 */

// Import the network manager
import * as NetworkManager from '../../../public/js/utils/networkManager.js';

// Core game state
let gameState = {
	board: [],
	chessPieces: [],
	activeTetromino: null,
	tetrominoList: [],
	selectedPiece: null,
	hoveredCell: { x: -1, y: -1, z: -1 },
	gameOver: false,
	winner: null,
	currentTurn: 1,
	turnPhase: 'tetris',
	score: {
		player1: 0,
		player2: 0
	},
	boardDimensions: {
		width: 16,
		height: 16
	},
	localPlayerId: 1,
	inMultiplayerMode: false,
	showChessControls: false,
	// Russian theme flags
	autoRotateCamera: true,
	hasSnow: true,
	showTetrisGhost: true,
	isPaused: false,
	// Camera positioning
	pendingCameraReset: null
};

// Cached DOM elements
let containerElement;
let scene, camera, renderer, controls;
let boardGroup, tetrominoGroup, chessPiecesGroup;
let raycaster, mouse;
let skybox, clouds;

// Player colors
const PLAYER_COLORS = {
	1: 0x3377FF, // Blue
	2: 0xFF8800, // Orange
	3: 0x33CC33, // Green
	4: 0xEE3377  // Pink/Purple
};

// Tetromino shapes (unchanged from minimal version)
const TETROMINO_SHAPES = {
	I: [
		[0, 0, 0, 0],
		[1, 1, 1, 1],
		[0, 0, 0, 0],
		[0, 0, 0, 0]
	],
	O: [
		[1, 1],
		[1, 1]
	],
	T: [
		[0, 1, 0],
		[1, 1, 1],
		[0, 0, 0]
	],
	J: [
		[1, 0, 0],
		[1, 1, 1],
		[0, 0, 0]
	],
	L: [
		[0, 0, 1],
		[1, 1, 1],
		[0, 0, 0]
	],
	S: [
		[0, 1, 1],
		[1, 1, 0],
		[0, 0, 0]
	],
	Z: [
		[1, 1, 0],
		[0, 1, 1],
		[0, 0, 0]
	]
};

// Texture cache
const textureLoader = new THREE.TextureLoader();
const modelLoader = new THREE.GLTFLoader();

// Enhanced game assets
const models = {
	pieces: {},
	board: null
};

const textures = {
	board: null,
	cells: {},
	skybox: null
};

/**
 * Initialize the game
 * @param {HTMLElement} container - Game container element
 */
export function initGame(container) {
	console.log('Initializing enhanced Shaktris core with Russian theme...');
	
	// Check if THREE is available
	if (typeof THREE === 'undefined') {
		console.error('THREE.js is not loaded! Make sure it is included before gameCore.js');
		showErrorMessage('THREE.js library is missing. Please check your internet connection and reload the page.');
		return false;
	}
	
	// Store container
	containerElement = container;
	
	try {
		// Initialize raycaster for mouse interaction
		raycaster = new THREE.Raycaster();
		mouse = new THREE.Vector2();
		
		// Set default board size
		gameState.boardDimensions.width = 16;
		
		// Create an empty game state - will be replaced with server data
		resetGameState();
		
		// Load assets and set up scene
		console.log('Loading assets...');
		
		// Initialize models and textures first
		createFallbackTextures();
		createFallbackModels();
		
		// Set up 3D scene
		setupScene();
		
		// Create empty board visualization
		createBoard();
		
		// Create game status display
		createGameStatusDisplay();
		
		// Add network status display
		createNetworkStatusDisplay();
		
		// Add event handlers with try/catch to prevent fatal errors
		try {
			// Set up network event listeners (with error handling inside)
			setupNetworkEvents();
		} catch (error) {
			console.warn('Error setting up network events:', error);
			// Continue without network functionality
		}
		
		try {
			// Set up input handlers
			setupInputHandlers();
		} catch (error) {
			console.warn('Error setting up input handlers:', error);
			// Continue without input handlers
		}
		
		// Start game loop
		startGameLoop();
		
		// Show tutorial message with a slight delay
		setTimeout(() => {
			showTutorialMessage();
		}, 500);
		
		console.log('Enhanced core initialization completed successfully');
		return true;
	} catch (error) {
		console.error('Error initializing game:', error);
		showErrorMessage(`Initialization error: ${error.message}. Please reload the page.`);
		return false;
	}
}

/**
 * Show error message in a styled overlay
 * @param {string} message - Error message to display
 */
function showErrorMessage(message) {
	// Create error message container if it doesn't exist
	let errorElement = document.getElementById('error-message');
	if (!errorElement) {
		errorElement = document.createElement('div');
		errorElement.id = 'error-message';
		
		// Style the error message with Russian theme
		Object.assign(errorElement.style, {
			position: 'fixed',
			top: '0',
			left: '0',
			width: '100%',
			height: '100%',
			backgroundColor: 'rgba(0, 0, 0, 0.9)',
			display: 'flex',
			justifyContent: 'center',
			alignItems: 'center',
			zIndex: '1001',
			color: '#ffcc00',
			textAlign: 'center',
			fontFamily: 'Times New Roman, serif',
			padding: '20px'
		});
		
		document.body.appendChild(errorElement);
	}
	
	// Set error message with Russian-themed styling
	errorElement.innerHTML = `
		<div style="max-width: 600px; background-color: rgba(50, 0, 0, 0.8); padding: 30px; border-radius: 10px; border: 2px solid #ffcc00;">
			<h2 style="color: #ffcc00; margin-top: 0;">Error</h2>
			<p style="font-size: 18px; margin-bottom: 20px;">${message}</p>
			<button onclick="window.location.reload()" style="background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 10px 20px; font-size: 16px; cursor: pointer; font-family: 'Times New Roman', serif;">
				Reload Page
			</button>
			<div style="margin-top: 15px;">
				<a href="minimal.html" style="color: #ffcc00; text-decoration: underline; font-size: 14px;">Try Minimal Version Instead</a>
			</div>
		</div>
	`;
	
	// Show the error message
	errorElement.style.display = 'flex';
}

/**
 * Load textures for the game
 */
function loadTextures() {
	console.log('Loading textures...');
	
	return new Promise((resolve, reject) => {
		try {
			// Create fallback textures
			createFallbackTextures();
			console.log('Textures loaded successfully');
			resolve();
		} catch (error) {
			console.error('Error setting up texture loading:', error);
			reject(error);
		}
	});
}

/**
 * Create fallback textures using canvas
 */
function createFallbackTextures() {
	// Create cell textures for each cell type
	
	// Player 1 (Blue) cell
	textures.cells[1] = createColorTexture(0x3377ff);
	
	// Player 2 (Orange) cell
	textures.cells[2] = createColorTexture(0xff7700);
	
	// Player 3 (Green) cell - for future use
	textures.cells[3] = createColorTexture(0x33cc33);
	
	// Player 4 (Purple) cell - for future use
	textures.cells[4] = createColorTexture(0xaa33cc);
	
	// Home zone textures
	textures.cells[6] = createColorTexture(0x1155aa, 0x3377ff);
	textures.cells[7] = createColorTexture(0xbb5500, 0xff7700);
	textures.cells[8] = createColorTexture(0x118811, 0x33cc33);
	textures.cells[9] = createColorTexture(0x771199, 0xaa33cc);
	
	// Create board texture
	textures.board = createCheckerboardTexture(0xdddddd, 0x222222);
	
	// Create skybox texture
	createSkyboxTexture();
}

/**
 * Create a basic color texture
 */
function createColorTexture(color, borderColor = null) {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;
	
	const context = canvas.getContext('2d');
	
	// Fill with main color
	context.fillStyle = '#' + color.toString(16).padStart(6, '0');
	context.fillRect(0, 0, 128, 128);
	
	// Add border if specified
	if (borderColor !== null) {
		context.strokeStyle = '#' + borderColor.toString(16).padStart(6, '0');
		context.lineWidth = 8;
		context.strokeRect(0, 0, 128, 128);
	}
	
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	
	return texture;
}

/**
 * Create a checkerboard texture
 */
function createCheckerboardTexture(color1, color2) {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 256;
	
	const context = canvas.getContext('2d');
	
	// Fill with checkerboard pattern
	const cellSize = 32;
	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			if ((x + y) % 2 === 0) {
				context.fillStyle = '#' + color1.toString(16).padStart(6, '0');
			} else {
				context.fillStyle = '#' + color2.toString(16).padStart(6, '0');
			}
			context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
		}
	}
	
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	
	return texture;
}

/**
 * Create skybox texture
 */
function createSkyboxTexture() {
	// Create a simple gradient for the skybox
	const topColor = new THREE.Color(0x77AAFF); // Light blue
	const bottomColor = new THREE.Color(0xFFFFFF); // White
	
	// Use existing function to create gradient
	const gradientTexture = createGradientTexture(topColor, bottomColor);
	textures.skybox = gradientTexture;
}

/**
 * Load 3D models for the game
 */
function loadModels() {
	console.log('Loading models...');
	
	return new Promise((resolve, reject) => {
		try {
			// Initialize fallback models
			createFallbackModels();
			console.log('Models loaded successfully');
			resolve();
		} catch (error) {
			console.error('Error loading models:', error);
			reject(error);
		}
	});
}

/**
 * Create fallback models using basic THREE.js geometry
 */
function createFallbackModels() {
	// Create models for players
	for (let playerId = 1; playerId <= 2; playerId++) {
		if (!models.pieces[playerId]) {
			models.pieces[playerId] = {};
		}
		
		// Define piece colors
		const pieceColor = playerId === 1 ? 0x3377ff : 0xff7700;
		const accentColor = playerId === 1 ? 0x1155dd : 0xcc5500;
		
		// Create materials
		const pieceMaterial = new THREE.MeshStandardMaterial({ 
			color: pieceColor,
			metalness: 0.2,
			roughness: 0.5
		});
		
		const accentMaterial = new THREE.MeshStandardMaterial({ 
			color: accentColor,
			metalness: 0.5,
			roughness: 0.2
		});
		
		// Create pawn - simple cylinder with sphere top
		const pawnGroup = new THREE.Group();
		const pawnBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.4, 0.3, 8),
			pieceMaterial
		);
		pawnBase.position.y = 0.15;
		
		const pawnBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.25, 0.3, 0.7, 8),
			pieceMaterial
		);
		pawnBody.position.y = 0.65;
		
		const pawnHead = new THREE.Mesh(
			new THREE.SphereGeometry(0.25, 16, 16),
			pieceMaterial
		);
		pawnHead.position.y = 1.15;
		
		pawnGroup.add(pawnBase, pawnBody, pawnHead);
		models.pieces[playerId]['pawn'] = pawnGroup;
		
		// Create rook - cylinder with blocky top
		const rookGroup = new THREE.Group();
		const rookBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.35, 0.45, 0.4, 8),
			pieceMaterial
		);
		rookBase.position.y = 0.2;
		
		const rookBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.35, 0.8, 8),
			pieceMaterial
		);
		rookBody.position.y = 0.8;
		
		const rookTop = new THREE.Mesh(
			new THREE.BoxGeometry(0.8, 0.3, 0.8),
			pieceMaterial
		);
		rookTop.position.y = 1.35;
		
		rookGroup.add(rookBase, rookBody, rookTop);
		models.pieces[playerId]['rook'] = rookGroup;
		
		// Create knight - cylinder with angled top
		const knightGroup = new THREE.Group();
		const knightBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.35, 0.45, 0.4, 8),
			pieceMaterial
		);
		knightBase.position.y = 0.2;
		
		const knightBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.35, 0.8, 8),
			pieceMaterial
		);
		knightBody.position.y = 0.8;
		
		const knightHead = new THREE.Mesh(
			new THREE.ConeGeometry(0.25, 0.6, 8),
			pieceMaterial
		);
		knightHead.position.y = 1.4;
		knightHead.rotation.z = Math.PI / 4;
		
		knightGroup.add(knightBase, knightBody, knightHead);
		models.pieces[playerId]['knight'] = knightGroup;
		
		// Create bishop - cylinder with pointed top
		const bishopGroup = new THREE.Group();
		const bishopBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.35, 0.45, 0.4, 8),
			pieceMaterial
		);
		bishopBase.position.y = 0.2;
		
		const bishopBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.3, 0.35, 1.0, 8),
			pieceMaterial
		);
		bishopBody.position.y = 0.9;
		
		const bishopTop = new THREE.Mesh(
			new THREE.ConeGeometry(0.3, 0.6, 16),
			pieceMaterial
		);
		bishopTop.position.y = 1.7;
		
		bishopGroup.add(bishopBase, bishopBody, bishopTop);
		models.pieces[playerId]['bishop'] = bishopGroup;
		
		// Create queen - cylinder with crown
		const queenGroup = new THREE.Group();
		const queenBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.4, 0.5, 0.4, 8),
			pieceMaterial
		);
		queenBase.position.y = 0.2;
		
		const queenBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.35, 0.4, 1.2, 8),
			pieceMaterial
		);
		queenBody.position.y = 1.0;
		
		const queenCrown = new THREE.Mesh(
			new THREE.SphereGeometry(0.4, 16, 16),
			accentMaterial
		);
		queenCrown.position.y = 1.8;
		
		queenGroup.add(queenBase, queenBody, queenCrown);
		models.pieces[playerId]['queen'] = queenGroup;
		
		// Create king - cylinder with cross
		const kingGroup = new THREE.Group();
		const kingBase = new THREE.Mesh(
			new THREE.CylinderGeometry(0.4, 0.5, 0.4, 8),
			pieceMaterial
		);
		kingBase.position.y = 0.2;
		
		const kingBody = new THREE.Mesh(
			new THREE.CylinderGeometry(0.35, 0.4, 1.2, 8),
			pieceMaterial
		);
		kingBody.position.y = 1.0;
		
		const kingCrown = new THREE.Mesh(
			new THREE.SphereGeometry(0.3, 16, 16),
			accentMaterial
		);
		kingCrown.position.y = 1.8;
		
		const kingCrossV = new THREE.Mesh(
			new THREE.BoxGeometry(0.1, 0.5, 0.1),
			accentMaterial
		);
		kingCrossV.position.y = 2.2;
		
		const kingCrossH = new THREE.Mesh(
			new THREE.BoxGeometry(0.4, 0.1, 0.1),
			accentMaterial
		);
		kingCrossH.position.y = 2.1;
		
		kingGroup.add(kingBase, kingBody, kingCrown, kingCrossV, kingCrossH);
		models.pieces[playerId]['king'] = kingGroup;
	}
}

/**
 * Reset game state to initial values
 */
function resetGameState() {
	console.log('Resetting game state...');
	
	// Initialize game state
	gameState = {
		board: [], // 2D array representing the board cells
		selectedPiece: null, // Currently selected chess piece
		chessPieces: [], // Array of all chess pieces
		currentTetromino: null, // Current active tetromino
		ghostPiece: null, // Ghost piece showing where tetromino will land
		validMoves: [], // Valid moves for selected chess piece
		score: 0,
		level: 1,
		turnPhase: 'tetris', // Start with tetris phase
		currentPlayer: 1, // Player 1 starts
		localPlayerId: 1, // Local player ID (from network)
		paused: false,
		gameOver: false,
		winner: null,
		lastPlacement: null, // Last tetromino placement
		lastMove: null, // Last chess move
		players: [], // List of players
		gameStarted: false, // Flag to track if game has been started
		homeZones: {}, // Store home zones information from server
		boardSize: 16
	};
}

/**
 * Set up the 3D scene with enhanced visuals
 */
function setupScene() {
	console.log('Setting up enhanced 3D scene with beautiful sky...');
	
	// Create scene
	scene = new THREE.Scene();
	
	// Create a beautiful light blue sky background - lighter color
	scene.background = new THREE.Color(0xAFE9FF); // Lighter sky blue
	scene.fog = new THREE.Fog(0xC5F0FF, 60, 150); // Lighter blue fog, pushed further back
	
	// Create camera
	const width = containerElement.clientWidth || window.innerWidth;
	const height = containerElement.clientHeight || window.innerHeight;
	
	camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
	camera.position.set(20, 25, 20);
	
	// Create renderer with improved settings
	renderer = new THREE.WebGLRenderer({ 
		antialias: true,
		alpha: true,
		powerPreference: 'high-performance'
	});
	renderer.setSize(width, Math.max(height, window.innerHeight * 0.9));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.outputEncoding = THREE.sRGBEncoding;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.3; // Brighter exposure for more vibrant scene
	
	// Ensure canvas will be visible
	renderer.domElement.style.width = '100%';
	renderer.domElement.style.height = '100vh';
	renderer.domElement.style.display = 'block';
	
	containerElement.appendChild(renderer.domElement);
	
	// Create orbit controls with better defaults
	if (typeof THREE.OrbitControls !== 'undefined') {
		controls = new THREE.OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.15;
		controls.screenSpacePanning = true;
		controls.minDistance = 10;
		controls.maxDistance = 80;
		controls.maxPolarAngle = Math.PI / 2 - 0.1; // Prevent going below horizon
		controls.target.set(8, 0, 8);
		controls.update();
	} else {
		console.warn('OrbitControls not available. Using static camera.');
	}
	
	// Add lights for a beautiful sunny day
	// Main sunlight - golden warm directional light
	const sunLight = new THREE.DirectionalLight(0xFFFBE8, 1.35); // Warm sunlight
	sunLight.position.set(25, 80, 30);
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.width = 2048;
	sunLight.shadow.mapSize.height = 2048;
	sunLight.shadow.camera.near = 10;
	sunLight.shadow.camera.far = 200;
	sunLight.shadow.camera.left = -50;
	sunLight.shadow.camera.right = 50;
	sunLight.shadow.camera.top = 50;
	sunLight.shadow.camera.bottom = -50;
	sunLight.shadow.bias = -0.0001; // Reduce shadow acne
	sunLight.shadow.normalBias = 0.02; // Improve shadow appearance on curved surfaces
	scene.add(sunLight);
	
	// Ambient light for general illumination - sky colored
	const ambientLight = new THREE.AmbientLight(0xB0E2FF, 0.65); // Sky-colored ambient light
	scene.add(ambientLight);
	
	// Add a soft golden backlight for rim lighting effect
	const backLight = new THREE.DirectionalLight(0xFFF0E0, 0.4); // Soft golden backlight
	backLight.position.set(-15, 20, -25);
	scene.add(backLight);
	
	// Add a soft blue-ish fill light from below for floating cells
	const fillLight = new THREE.DirectionalLight(0xC8E0FF, 0.25); // Light blue
	fillLight.position.set(-20, -5, -20);
	scene.add(fillLight);
	
	// Add a subtle hemisphere light for better outdoor lighting
	const hemisphereLight = new THREE.HemisphereLight(0xFFFBE8, 0x080820, 0.5);
	scene.add(hemisphereLight);
	
	// Create board group
	boardGroup = new THREE.Group();
	scene.add(boardGroup);
	
	// Create tetromino group
	tetrominoGroup = new THREE.Group();
	tetrominoGroup.name = 'tetrominos';
	scene.add(tetrominoGroup);
	
	// Create chess pieces group
	chessPiecesGroup = new THREE.Group();
	scene.add(chessPiecesGroup);
	
	// Add beautiful fluffy clouds to scene
	createFewClouds();
	
	// Add resize listener
	window.addEventListener('resize', onWindowResize);
}

/**
 * Handle window resize
 */
function onWindowResize() {
	if (!camera || !renderer || !containerElement) return;
	
	const width = containerElement.clientWidth || window.innerWidth;
	const height = containerElement.clientHeight || window.innerHeight;
	
	// Enforce minimum height
	if (height <= 1) {
		containerElement.style.height = '100%';
		containerElement.style.minHeight = '100vh';
	}
	
	camera.aspect = width / Math.max(height, 1);
	camera.updateProjectionMatrix();
	
	renderer.setSize(width, Math.max(height, window.innerHeight * 0.9));
}

// Add additional functions for enhanced visualizations, particle effects, etc.
// We'll include the core functionality from minimal-gameCore.js with visual enhancements.

/**
 * Create a gradient texture for background
 */
function createGradientTexture(topColor, bottomColor) {
	const canvas = document.createElement('canvas');
	canvas.width = 2;
	canvas.height = 512;
	
	const context = canvas.getContext('2d');
	const gradient = context.createLinearGradient(0, 0, 0, 512);
	gradient.addColorStop(0, topColor.getStyle());
	gradient.addColorStop(1, bottomColor.getStyle());
	
	context.fillStyle = gradient;
	context.fillRect(0, 0, 2, 512);
	
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	
	return texture;
}

/**
 * Create animated clouds for sky
 */
function createClouds() {
	try {
		// Create clouds container
		clouds = new THREE.Group();
		clouds.name = 'clouds';
		
		// Create cloud particles
		const cloudCount = 20;
		const cloudGeometry = new THREE.PlaneGeometry(30, 15);
		
		// Create a fallback cloud texture if loading fails
		let cloudTexture;
		try {
			// Attempt to load cloud texture
			cloudTexture = textureLoader.load('textures/environment/cloud.png', 
				// Success callback
				undefined, 
				// Progress callback
				undefined,
				// Error callback 
				() => {
					console.warn('Cloud texture loading failed, using fallback');
					cloudTexture = createCloudFallbackTexture();
				}
			);
		} catch (error) {
			console.warn('Cloud texture creation failed, using fallback:', error);
			cloudTexture = createCloudFallbackTexture();
		}
		
		const cloudMaterial = new THREE.MeshBasicMaterial({
			map: cloudTexture,
			transparent: true,
			opacity: 0.7,
			depthWrite: false,
			side: THREE.DoubleSide
		});
		
		for (let i = 0; i < cloudCount; i++) {
			const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
			
			// Random position
			cloud.position.set(
				Math.random() * 200 - 100,
				60 + Math.random() * 30,
				Math.random() * 200 - 100
			);
			
			// Random rotation
			cloud.rotation.z = Math.random() * Math.PI;
			
			// Random scale
			const scale = 0.5 + Math.random() * 2;
			cloud.scale.set(scale, scale, scale);
			
			// Store movement data
			cloud.userData.speed = 0.05 + Math.random() * 0.1;
			cloud.userData.direction = new THREE.Vector3(
				Math.random() * 0.1 - 0.05,
				0,
				Math.random() * 0.1 - 0.05
			);
			
			clouds.add(cloud);
		}
		
		// Add clouds to scene
		scene.add(clouds);
	} catch (error) {
		console.warn('Failed to create clouds:', error);
		// Continue without clouds
	}
}

/**
 * Create a fallback cloud texture
 * @returns {THREE.Texture} A simple cloud texture
 */
function createCloudFallbackTexture() {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 64;
	
	const context = canvas.getContext('2d');
	
	// Fill with gradient
	const gradient = context.createRadialGradient(
		canvas.width / 2, canvas.height / 2, 0,
		canvas.width / 2, canvas.height / 2, canvas.width / 2
	);
	gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
	gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
	gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
	
	context.fillStyle = gradient;
	context.fillRect(0, 0, canvas.width, canvas.height);
	
	const texture = new THREE.CanvasTexture(canvas);
	texture.needsUpdate = true;
	
	return texture;
}

/**
 * Animate clouds and floating islands
 */
function animateClouds() {
	// Cloud animation
	if (clouds && clouds.children && clouds.children.length > 0) {
		clouds.children.forEach(cloud => {
			// Move cloud very slowly
			if (cloud.userData.direction) {
				// Handle background clouds slightly differently
				if (cloud.userData.isBackgroundCloud) {
					// Move horizontally around the board, slower
					cloud.position.x += cloud.userData.direction.x;
					cloud.position.z += cloud.userData.direction.y;
					
					// Rotate very slightly for gentle movement
					cloud.rotation.z += 0.00005;
					
					// Very large wrap-around for distant clouds
					if (cloud.position.x > 500) cloud.position.x = -500;
					if (cloud.position.x < -500) cloud.position.x = 500;
					if (cloud.position.z > 500) cloud.position.z = -500;
					if (cloud.position.z < -500) cloud.position.z = 500;
				} else {
					// Regular clouds
					cloud.position.x += cloud.userData.direction.x;
					cloud.position.z += cloud.userData.direction.y;
					
					// Extremely subtle vertical bobbing
					cloud.position.y += Math.sin(Date.now() * 0.0003 + cloud.position.x * 0.01) * 0.002;
					
					// Very slight rotation
					cloud.rotation.y += 0.0001;
					
					// Wrap around when out of bounds
					if (cloud.position.x > 200) cloud.position.x = -200;
					if (cloud.position.x < -200) cloud.position.x = 200;
					if (cloud.position.z > 200) cloud.position.z = -200;
					if (cloud.position.z < -200) cloud.position.z = 200;
				}
			}
		});
	}
	
	// Animate floating islands with subtle bobbing motion
	if (boardGroup && boardGroup.children && boardGroup.children.length > 0) {
		boardGroup.children.forEach(island => {
			if (island.isIsland) return; // Skip non-island objects
			
			// Calculate a hash based on island position for varied animation
			const posHash = (island.position.x * 412.531 + island.position.z * 123.32);
			
			// Subtle vertical bobbing with varied frequencies and phases
			const time = Date.now() * 0.0002;
			const bobAmount = 0.01 + Math.abs(Math.sin(posHash)) * 0.01;
			const frequency = 0.5 + Math.abs(Math.sin(posHash * 2.3)) * 0.5;
			const phase = posHash * 10.0;
			
			// Apply vertical bobbing
			island.position.y = island.userData.baseY || island.position.y;
			island.userData.baseY = island.position.y; // Store original Y if not already stored
			island.position.y += Math.sin(time * frequency + phase) * bobAmount;
			
			// Very subtle rotation to enhance floating feeling
			const rotAmount = 0.0005 * Math.sin(time * 0.7 + phase);
			island.rotation.x += Math.sin(time * 0.5 + phase * 1.1) * rotAmount;
			island.rotation.z += Math.sin(time * 0.6 + phase * 1.3) * rotAmount;
		});
	}
}

/**
 * Create game status display
 */
function createGameStatusDisplay() {
	console.log('Creating game status display...');
	
	// Create or get status container
	let statusContainer = document.getElementById('game-status');
	if (!statusContainer) {
		statusContainer = document.createElement('div');
		statusContainer.id = 'game-status';
		
		// Style the container with Russian theme
		Object.assign(statusContainer.style, {
			position: 'fixed',
			top: '10px',
			right: '10px',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			color: '#ffcc00', // Gold text
			padding: '15px',
			borderRadius: '5px',
			fontFamily: 'Times New Roman, serif', // Russian-style font
			fontSize: '16px',
			zIndex: '100',
			minWidth: '220px',
			textAlign: 'center',
			border: '2px solid #ffcc00', // Gold border
			boxShadow: '0 0 10px rgba(255, 204, 0, 0.3)' // Gold glow
		});
		
		document.body.appendChild(statusContainer);
	}
	
	// Create or get controls container for debug options
	let controlsContainer = document.getElementById('debug-controls');
	if (!controlsContainer) {
		controlsContainer = document.createElement('div');
		controlsContainer.id = 'debug-controls';
		
		// Style the container with Russian theme
		Object.assign(controlsContainer.style, {
			position: 'fixed',
			top: '200px',
			right: '10px',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			color: '#ffcc00', // Gold text
			padding: '10px',
			borderRadius: '5px',
			fontFamily: 'Times New Roman, serif', // Russian-style font
			fontSize: '14px',
			zIndex: '100',
			minWidth: '150px',
			border: '1px solid #ffcc00' // Gold border
		});
		
		// Add simplified debug controls with Russian-style buttons
		controlsContainer.innerHTML = `
			<div style="text-align: center; margin-bottom: 10px; font-weight: bold;">Game Controls</div>
			<div style="margin-bottom: 10px;">
				<button id="debug-tetris-phase" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; margin-bottom: 5px; cursor: pointer;">Tetris Phase</button>
				<button id="debug-chess-phase" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; cursor: pointer;">Chess Phase</button>
			</div>
			<div>
				<button id="debug-reset-board" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; margin-bottom: 5px; cursor: pointer;">Reset Board</button>
				<button id="debug-reset-camera" style="width: 100%; background: #333; color: #ffcc00; border: 1px solid #ffcc00; padding: 5px 10px; cursor: pointer;">Reset Camera</button>
			</div>
		`;
		
		document.body.appendChild(controlsContainer);
		
		// Add event listeners for debug controls
		document.getElementById('debug-tetris-phase').addEventListener('click', () => {
			gameState.turnPhase = 'tetris';
			updateGameStatusDisplay();
		});
		
		document.getElementById('debug-chess-phase').addEventListener('click', () => {
			gameState.turnPhase = 'chess';
			updateGameStatusDisplay();
		});
		
		document.getElementById('debug-reset-board').addEventListener('click', () => {
			resetGameState();
			createBoard();
			updateGameStatusDisplay();
		});
		
		document.getElementById('debug-reset-camera').addEventListener('click', () => {
			resetCameraView(true);
		});
	}
	
	// Initial update
	updateGameStatusDisplay();
}

/**
 * Update game status display
 */
function updateGameStatusDisplay() {
	// Create or get game status display
	let statusDisplay = document.getElementById('game-status');
	
	// If no status display exists, create one
	if (!statusDisplay) {
		statusDisplay = document.createElement('div');
		statusDisplay.id = 'game-status';
		
		// Style the status display with Russian theme
		Object.assign(statusDisplay.style, {
			position: 'fixed',
			bottom: '10px',
			left: '50%',
			transform: 'translateX(-50%)',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			color: '#ffcc00', // Gold text
			padding: '10px 20px',
			borderRadius: '5px',
			fontFamily: 'Times New Roman, serif', // Russian-style font
			zIndex: '1000',
			textAlign: 'center',
			fontSize: '16px',
			border: '1px solid #ffcc00' // Gold border
		});
		
		document.body.appendChild(statusDisplay);
	}
	
	// Update status based on game state
	if (gameState.isGameOver) {
		statusDisplay.innerHTML = `
			<div style="color: #FFD700; font-size: 18px;">Game Over</div>
			<div>Player ${gameState.winner} wins!</div>
			<div style="margin-top: 5px;">â˜¦</div>
		`;
		statusDisplay.style.backgroundColor = 'rgba(128, 0, 0, 0.8)';
	} else if (!gameState.currentPlayer) {
		statusDisplay.textContent = 'Waiting for game to start...';
	} else {
		let phase = gameState.turnPhase === 'tetris' ? 'Place Tetromino' : 'Move Chess Piece';
		let playerColor = gameState.currentPlayer === 1 ? '#4477FF' : '#FF7744';
		
		statusDisplay.innerHTML = `
			<div>
				Player ${gameState.currentPlayer} - 
				<span style="color: ${playerColor};">${phase}</span>
			</div>
		`;
		
		// Highlight if it's the current turn
		if (NetworkManager.getPlayerId() === `player${gameState.currentPlayer}`) {
			statusDisplay.style.backgroundColor = 'rgba(0, 128, 0, 0.8)';
		} else {
			statusDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		}
	}
}

/**
 * Create a network status display
 */
function createNetworkStatusDisplay() {
	// Create the network status element with Russian-style design
	const networkStatusElement = document.createElement('div');
	networkStatusElement.id = 'network-status';
	
	// Style the network status element
	Object.assign(networkStatusElement.style, {
		position: 'fixed',
		top: '10px',
		left: '10px',
		padding: '5px 10px',
		borderRadius: '5px',
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		color: '#ffcc00', // Gold color for Russian theme
		fontFamily: 'Times New Roman, serif', // Russian-style font
		fontSize: '12px',
		zIndex: '1000',
		pointerEvents: 'none',
		border: '1px solid #ffcc00' // Gold border
	});
	
	// Set initial status text
	networkStatusElement.textContent = 'Network: Connecting...';
	
	// Add to DOM
	document.body.appendChild(networkStatusElement);
	
	// Update status based on current connection
	updateNetworkStatus(NetworkManager.isConnected() ? 'connected' : 'disconnected');
}

/**
 * Update the network status display
 * @param {string} status - The current network status: 'connecting', 'connected', or 'disconnected'
 */
function updateNetworkStatus(status) {
	const networkStatusElement = document.getElementById('network-status');
	
	if (!networkStatusElement) return;
	
	// Set text and color based on status with Russian theme
	switch (status) {
		case 'connected':
			networkStatusElement.textContent = 'Network: Connected';
			networkStatusElement.style.backgroundColor = 'rgba(0, 128, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
			break;
		case 'disconnected':
			networkStatusElement.textContent = 'Network: Disconnected';
			networkStatusElement.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
			break;
		case 'connecting':
			networkStatusElement.textContent = 'Network: Connecting...';
			networkStatusElement.style.backgroundColor = 'rgba(255, 165, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
			break;
		default:
			networkStatusElement.textContent = `Network: ${status}`;
			networkStatusElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
			networkStatusElement.style.borderColor = '#ffcc00'; // Gold border
	}
}

/**
 * Show a tutorial message with Russian-themed styling
 */
function showTutorialMessage() {
	// Check if tutorial is already showing
	if (document.getElementById('tutorial-message')) {
		console.log('Tutorial already showing, not creating another one');
		return;
	}
	
	// Create tutorial message
	const tutorialElement = document.createElement('div');
	tutorialElement.id = 'tutorial-message';
	
	// Style the container with Russian theme
	Object.assign(tutorialElement.style, {
		position: 'fixed',
		top: '50%',
		left: '50%',
		transform: 'translate(-50%, -50%)',
		backgroundColor: 'rgba(0, 0, 0, 0.9)',
		color: 'white',
		padding: '20px',
		borderRadius: '10px',
		fontFamily: 'Times New Roman, serif', // Russian-style font
		fontSize: '16px',
		zIndex: '1000',
		maxWidth: '80%',
		textAlign: 'center',
		border: '2px solid #ffcc00', // Gold border
		boxShadow: '0 0 10px rgba(255, 204, 0, 0.5)' // Gold glow
	});
	
	// Add content with Russian-themed styling
	tutorialElement.innerHTML = `
		<h2 style="color: #ffcc00; margin-top: 0; font-family: 'Times New Roman', serif;">Welcome to Shaktris</h2>
		<p>A massively multiplayer game combining Chess and Tetris with Russian-inspired visuals</p>
		
		<div style="text-align: left; margin: 15px 0;">
			<h3 style="color: #ffcc00; font-family: 'Times New Roman', serif;">How to Play:</h3>
			<ul style="line-height: 1.5;">
				<li><strong>All Players Play Simultaneously</strong> - There are no turns between players!</li>
				<li><strong>Player Cycle:</strong> Each player follows their own cycle:
					<ol>
						<li>First, place a Tetromino (pieces now fall vertically from above)</li>
						<li>Then, move one of your chess pieces</li>
						<li>Repeat - each player plays at their own pace</li>
					</ol>
				</li>
				<li><strong>Tetris Phase:</strong> Tetris pieces automatically fall from above
					<ul>
						<li>Arrow keys: Move tetromino horizontally/vertically on the board</li>
						<li>Z/X: Rotate tetromino</li>
						<li>Space: Hard drop tetromino</li>
						<li>Pieces will explode if they collide with existing blocks!</li>
					</ul>
				</li>
				<li><strong>Chess Phase:</strong> After placing your tetromino
					<ul>
						<li>Click on your piece to select it</li>
						<li>Green circles show where you can move</li>
						<li>Click on a green circle to move there</li>
						<li>After moving, your chess phase ends and you start a new tetris phase</li>
					</ul>
				</li>
				<li><strong>Objective:</strong> Capture opponent kings!</li>
			</ul>
		</div>
		
		<p style="font-style: italic; margin-top: 10px;">This is a massively multiplayer game where all players play independently at the same time.</p>
		
		<div style="text-align: center; margin-top: 20px;">
			<div style="font-size: 36px; color: #ffcc00; margin-bottom: 10px;">â˜¦</div>
			<button id="tutorial-close" style="padding: 12px 30px; background-color: #333; color: #ffcc00; border: 2px solid #ffcc00; border-radius: 5px; cursor: pointer; font-size: 18px; font-weight: bold; font-family: 'Times New Roman', serif; animation: pulse 2s infinite;">START PLAYING</button>
		</div>
	`;
	
	// Add pulse animation style
	const style = document.createElement('style');
	style.textContent = `
		@keyframes pulse {
			0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 204, 0, 0.7); }
			50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(255, 204, 0, 0); }
			100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 204, 0, 0); }
		}
	`;
	document.head.appendChild(style);
	
	// Add to body
	document.body.appendChild(tutorialElement);
	
	// Add event listener to close button
	document.getElementById('tutorial-close').addEventListener('click', () => {
		console.log('START PLAYING button clicked - starting game...');
		
		// Remove the tutorial
		document.body.removeChild(tutorialElement);
		
		// Start the game with a slight delay to ensure UI updates
		setTimeout(() => {
			startPlayingGame(); // Start the game when "Start Playing" is clicked
		}, 100);
	});
}

/**
 * Start playing the game
 */
function startPlayingGame() {
	console.log('Starting game...');
	
	// Prevent multiple start attempts
	if (gameState.gameStarted) {
		console.log('Game already started, ignoring request');
		showToastMessage('Game already in progress!');
		return;
	}
	
	// Mark game as started
	gameState.gameStarted = true;
	
	// Show a toast notification (only once)
	showToastMessage('Starting game!');
	
	// Store camera reset request for when we have game data
	gameState.pendingCameraReset = {
		animate: true,
		timestamp: Date.now()
	};
	
	// Only need to do this once - removes all previous timeout handlers
	let hasRunResetSequence = false;
	
	// Remove the connecting message if it exists
	if (document.getElementById('connection-loading-message')) {
		document.body.removeChild(document.getElementById('connection-loading-message'));
	}
	
	// Check connection and join a game
	if (NetworkManager.isConnected()) {
		updateNetworkStatus('connected');
		
		// Join the global game
		NetworkManager.joinGame()
			.then(gameData => {
				console.log('Joined game:', gameData);
				updateNetworkStatus('connected');
				
				// Request game state from server
				requestGameState();
			})
			.catch(error => {
				console.error('Failed to join game:', error);
				updateNetworkStatus('error');
				
				// Start with local state as fallback
				startFirstTurn();
			});
	} else {
		// Try to connect
		NetworkManager.initialize()
			.then(() => NetworkManager.joinGame())
			.then(gameData => {
				console.log('Connected and joined game:', gameData);
				updateNetworkStatus('connected');
				
				// Request game state
				requestGameState();
			})
			.catch(error => {
				console.error('Failed to connect:', error);
				updateNetworkStatus('disconnected');
				
				// Start with local state as fallback
				startFirstTurn();
			});
	}
}

/**
 * Request game state from server
 */
function requestGameState() {
	if (!NetworkManager.isConnected || !NetworkManager.isConnected()) {
		console.log('Not connected to server, using local state');
		startFirstTurn();
		return;
	}
	
	if (!NetworkManager.getGameId) {
		console.log('No getGameId method available, using local state');
		startFirstTurn();
		return;
	}
	
	const gameId = NetworkManager.getGameId();
	if (!gameId) {
		console.log('No game ID available, using local state');
		startFirstTurn();
		return;
	}
	
	console.log('Requesting game state from server for game ID:', gameId);
	
	// Try multiple methods to ensure we get a response
	if (NetworkManager.getGameState) {
		// Direct API method
		NetworkManager.getGameState({ gameId: gameId })
			.then(response => {
				console.log('Game state received via getGameState API:', response);
				if (response && response.board) {
					handleGameStateUpdate(response);
				} else {
					throw new Error('Invalid game state data received');
				}
			})
			.catch(error => {
				console.warn('Failed to get game state via API, trying message approach:', error);
				sendGameStateRequest();
			});
	} else {
		// Message-based approach
		sendGameStateRequest();
	}
	
	// Set timeout for fallback to local state
	setTimeout(() => {
		if (!gameState.board || gameState.board.length === 0) {
			console.log('No game state received from server after timeout, using local state');
			startFirstTurn();
		}
	}, 8000); // Longer timeout to account for multiple attempts
}

/**
 * Send game state request via available messaging methods
 */
function sendGameStateRequest() {
	const gameId = NetworkManager.getGameId();
	
	// Try all available methods
	if (NetworkManager.sendMessage) {
		NetworkManager.sendMessage('get_game_state', { gameId });
		console.log('Sent get_game_state message');
	}
	
	if (NetworkManager.emit) {
		NetworkManager.emit('get_game_state', { gameId });
		console.log('Emitted get_game_state event');
	}
	
	// Direct socket.io approach as last resort
	if (NetworkManager.getSocket && NetworkManager.getSocket()) {
		const socket = NetworkManager.getSocket();
		socket.emit('get_game_state', { gameId });
		console.log('Direct socket emit for get_game_state');
	}
}

/**
 * Show toast message
 * @param {string} message - Message to display
 * @param {number} duration - Duration in milliseconds
 */
function showToastMessage(message, duration = 3000) {
	// Create or get toast container
	let toastContainer = document.getElementById('toast-container');
	if (!toastContainer) {
		toastContainer = document.createElement('div');
		toastContainer.id = 'toast-container';
		
		// Style container
		Object.assign(toastContainer.style, {
			position: 'fixed',
			bottom: '20px',
			left: '50%',
			transform: 'translateX(-50%)',
			zIndex: '1000',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			width: 'auto',
			maxWidth: '80%',
			pointerEvents: 'none'
		});
		
		document.body.appendChild(toastContainer);
	}
	
	// Create toast element with Russian-themed styling
	const toast = document.createElement('div');
	toast.classList.add('toast-message');
	
	// Style the toast
	Object.assign(toast.style, {
		backgroundColor: 'rgba(0, 0, 0, 0.8)',
		color: '#ffcc00', // Gold text for Russian theme
		padding: '10px 20px',
		borderRadius: '5px',
		marginBottom: '10px',
		fontSize: '16px',
		fontFamily: 'Times New Roman, serif', // Russian-style font
		boxShadow: '0 2px 10px rgba(255, 204, 0, 0.3)', // Gold glow
		opacity: '0',
		transition: 'opacity 0.3s, transform 0.3s',
		transform: 'translateY(20px)',
		textAlign: 'center',
		maxWidth: '100%',
		border: '1px solid #ffcc00' // Gold border
	});
	
	// Set message content
	toast.textContent = message;
	
	// Add to container
	toastContainer.appendChild(toast);
	
	// Animate in
	setTimeout(() => {
		toast.style.opacity = '1';
		toast.style.transform = 'translateY(0)';
	}, 10);
	
	// Animate out and remove after duration
	setTimeout(() => {
		toast.style.opacity = '0';
		toast.style.transform = 'translateY(-20px)';
		
		// Remove after animation
		setTimeout(() => {
			if (toast.parentNode) {
				toast.parentNode.removeChild(toast);
			}
		}, 300);
	}, duration);
}

/**
 * Reset camera with specific gameplay settings
 * @param {boolean} animate - Whether to animate the camera movement
 * @param {boolean} forceImmediate - Whether to position immediately without waiting for home zone
 */
function resetCameraForGameplay(animate = true, forceImmediate = false) {
	console.log('Resetting camera for gameplay view');
	
	if (!camera || !controls) {
		console.warn('Camera or controls not initialized');
		return;
	}
	
	// If we want to wait for game data but don't have it yet, defer the repositioning
	if (!forceImmediate && (!gameState.board || !gameState.board.length || !gameState.homeZones)) {
		console.log('Waiting for game data before repositioning camera...');
		
		// Store the request for later execution
		gameState.pendingCameraReset = {
			animate: animate,
			requestTime: Date.now()
		};
		
		// Set a default position for now
		if (!camera.position.equals(new THREE.Vector3(20, 25, 20))) {
			camera.position.set(20, 25, 20);
			controls.target.set(0, 0, 0);
			controls.update();
		}
		
		return;
	}
	
	// Define target position based on home zone if available
	let targetPosition = {
		x: 5, // Default x
		y: 15, // Default height 
		z: 25  // Default z
	};
	
	let lookAt = {
		x: 5, // Default focus x
		y: 0, // Default focus y
		z: 12 // Default focus z
	};
	
	// Get player ID
	const playerId = NetworkManager.getPlayerId ? NetworkManager.getPlayerId() : null;
	
	// If we have home zones data and playerId, position based on player's home zone
	if (playerId && gameState.homeZones && Object.keys(gameState.homeZones).length > 0) {
		// Find the player's home zone
		let homeZone = null;
		for (const [id, zone] of Object.entries(gameState.homeZones)) {
			if (id === playerId || id.includes(playerId)) {
				homeZone = zone;
				break;
			}
		}
		
		// If no home zone found, use the first one as fallback
		if (!homeZone && Object.values(gameState.homeZones).length > 0) {
			homeZone = Object.values(gameState.homeZones)[0];
		}
		
		// If home zone found, position camera based on it
		if (homeZone) {
			console.log('Positioning camera based on home zone:', homeZone);
			
			// Calculate board center-relative coordinates
			const boardCenter = gameState.boardSize / 2;
			const homeX = homeZone.x - boardCenter;
			const homeZ = homeZone.z - boardCenter;
			
			// Position camera looking at home zone from a good angle
			targetPosition = {
				x: homeX - 5, // Position to left of home zone
				y: 15,        // Height
				z: homeZ + 15 // Position behind home zone
			};
			
			lookAt = {
				x: homeX + homeZone.width/2, // Look at center of home zone
				y: 0,
				z: homeZ + homeZone.height/2
			};
			
			console.log('Camera will move to:', targetPosition, 'looking at:', lookAt);
		}
	}
	
	// Set camera position immediately or animate
	if (!animate) {
		camera.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
		controls.target.set(lookAt.x, lookAt.y, lookAt.z);
		controls.update();
		
		// Force a render
		if (renderer && scene) {
			renderer.render(scene, camera);
		}
		return;
	}
	
	// Get current position
	const startPosition = {
		x: camera.position.x,
		y: camera.position.y,
		z: camera.position.z
	};
	
	// Get current look-at
	const startLookAt = controls.target.clone();
	
	// Animation duration
	const duration = 2000; // 2 seconds for a more dramatic effect
	const startTime = Date.now();
	
	// Animate camera movement
	function animateCamera() {
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);
		
		// Ease function (cubic)
		const ease = 1 - Math.pow(1 - progress, 3);
		
		// Update camera position
		camera.position.x = startPosition.x + (targetPosition.x - startPosition.x) * ease;
		camera.position.y = startPosition.y + (targetPosition.y - startPosition.y) * ease;
		camera.position.z = startPosition.z + (targetPosition.z - startPosition.z) * ease;
		
		// Update controls target
		controls.target.x = startLookAt.x + (lookAt.x - startLookAt.x) * ease;
		controls.target.y = startLookAt.y + (lookAt.y - startLookAt.y) * ease;
		controls.target.z = startLookAt.z + (lookAt.z - startLookAt.z) * ease;
		
		// Update controls
		controls.update();
		
		// Force renderer update
		if (renderer && scene) {
			renderer.render(scene, camera);
		}
		
		// Continue animation if not done
		if (progress < 1) {
			requestAnimationFrame(animateCamera);
		}
	}
	
	// Start animation
	animateCamera();
}

/**
 * Start the first turn of the game (local fallback)
 */
function startFirstTurn() {
	console.log('Waiting for board data from server...');
	
	// Update status display
	updateGameStatusDisplay();
	
	// Show a toast to guide the player
	showToastMessage('Connecting to game server...');
	
	// Create overlay for dimming the screen during connection attempts
	const createConnectionOverlay = () => {
		// Remove any existing overlay first
		const existingOverlay = document.getElementById('connection-overlay');
		if (existingOverlay) {
			existingOverlay.parentNode.removeChild(existingOverlay);
		}
		
		// Create new overlay
		const overlay = document.createElement('div');
		overlay.id = 'connection-overlay';
		overlay.style.position = 'fixed';
		overlay.style.top = '0';
		overlay.style.left = '0';
		overlay.style.width = '100%';
		overlay.style.height = '100%';
		overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		overlay.style.display = 'flex';
		overlay.style.flexDirection = 'column';
		overlay.style.justifyContent = 'center';
		overlay.style.alignItems = 'center';
		overlay.style.zIndex = '9999';
		overlay.style.color = 'white';
		overlay.style.fontFamily = 'Arial, sans-serif';
		overlay.style.transition = 'opacity 0.5s ease';
		
		// Add connection message
		const message = document.createElement('div');
		message.id = 'connection-message';
		message.textContent = 'Connecting to game server...';
		message.style.fontSize = '24px';
		message.style.marginBottom = '20px';
		
		// Add spinner
		const spinner = document.createElement('div');
		spinner.style.border = '5px solid #f3f3f3';
		spinner.style.borderTop = '5px solid #3498db';
		spinner.style.borderRadius = '50%';
		spinner.style.width = '50px';
		spinner.style.height = '50px';
		spinner.style.animation = 'spin 2s linear infinite';
		
		// Add spinner animation
		const style = document.createElement('style');
		style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
		document.head.appendChild(style);
		
		// Add retry info
		const retryInfo = document.createElement('div');
		retryInfo.id = 'retry-info';
		retryInfo.textContent = 'Attempting to connect...';
		retryInfo.style.marginTop = '20px';
		retryInfo.style.fontSize = '16px';
		
		// Assemble overlay
		overlay.appendChild(message);
		overlay.appendChild(spinner);
		overlay.appendChild(retryInfo);
		document.body.appendChild(overlay);
		
		return {
			overlay,
			message,
			retryInfo
		};
	};
	
	// Create the initial overlay
	const { overlay, message, retryInfo } = createConnectionOverlay();
	
	// Set up reconnection attempts with increasing timeouts
	let reconnectAttempt = 0;
	const maxReconnectAttempts = 10;
	const baseTimeout = 2000; // 2 seconds initial timeout
	
	const attemptReconnect = () => {
		reconnectAttempt++;
		
		if (reconnectAttempt > maxReconnectAttempts) {
			// Max attempts reached, show final message
			message.textContent = 'Could not connect to game server';
			retryInfo.textContent = 'Please check your connection and refresh the page.';
			return;
		}
		
		// Calculate timeout with exponential backoff
		const timeout = baseTimeout * Math.pow(1.5, reconnectAttempt - 1);
		
		// Update overlay message
		message.textContent = 'Connecting to game server...';
		retryInfo.textContent = `Attempt ${reconnectAttempt} of ${maxReconnectAttempts} (waiting ${Math.round(timeout/1000)}s)`;
		
		// Try to reconnect after timeout
		setTimeout(() => {
			// Check if we have data already
			if (gameState.board && gameState.board.length) {
				// We got data while waiting, remove overlay
				overlay.style.opacity = '0';
				setTimeout(() => {
					if (overlay.parentNode) {
						overlay.parentNode.removeChild(overlay);
					}
				}, 500);
				return;
			}
			
			// Try to reconnect via NetworkManager
			if (typeof NetworkManager !== 'undefined' && NetworkManager.initialize) {
				retryInfo.textContent = `Attempt ${reconnectAttempt} of ${maxReconnectAttempts} - Reconnecting...`;
				
				// Reinitialize connection and attempt to join game
				NetworkManager.initialize()
					.then(() => NetworkManager.joinGame())
					.then((result) => {
						console.log('Reconnection successful:', result);
						retryInfo.textContent = 'Connection established!';
						
						// Give a moment for the server to send game state
						setTimeout(() => {
							if (!gameState.board || !gameState.board.length) {
								// Still no board data, try next attempt
								attemptReconnect();
							} else {
								// We got data, remove overlay
								overlay.style.opacity = '0';
								setTimeout(() => {
									if (overlay.parentNode) {
										overlay.parentNode.removeChild(overlay);
									}
								}, 500);
							}
						}, 2000);
					})
					.catch((error) => {
						console.error('Reconnection failed:', error);
						retryInfo.textContent = `Connection failed. Retrying in ${Math.round(timeout/1000)}s...`;
						attemptReconnect();
					});
			} else {
				// NetworkManager not available, try next attempt
				retryInfo.textContent = 'Connection service unavailable';
				attemptReconnect();
			}
		}, timeout);
	};
	
	// Start connection attempts if we don't already have board data
	if (!gameState.board || !gameState.board.length) {
		attemptReconnect();
	} else {
		// We already have board data, no need for connection overlay
		if (overlay.parentNode) {
			overlay.parentNode.removeChild(overlay);
		}
	}
}

/**
 * Helper function to add a chess piece to the board
 */
function addChessPiece(board, pieceCode, x, y) {
	// Check if position is valid
	if (x >= 0 && x < board.length && y >= 0 && y < board.length) {
		// Ensure there's a board cell at this position (not empty)
		const cellType = board[y][x];
		if (cellType === 0) {
			// Create a cell for this piece
			const player = Math.floor(pieceCode / 10);
			board[y][x] = player;
		}
		
		// Place the chess piece
		board[y][x] = pieceCode;
	}
}

/**
 * Update render size when container resizes
 */
export function updateRenderSize() {
	if (camera && renderer && containerElement) {
		const width = containerElement.clientWidth || window.innerWidth;
		const height = containerElement.clientHeight || window.innerHeight;
		
		// Enforce minimum height
		if (height <= 1) {
			containerElement.style.height = '100vh';
			containerElement.style.minHeight = '100vh';
		}
		
		camera.aspect = width / Math.max(height, 1);
		camera.updateProjectionMatrix();
		
		renderer.setSize(width, Math.max(height, window.innerHeight * 0.9));
	}
}

/**
 * Create the game board with enhanced visuals
 */
function createBoard() {
	console.log('Creating floating islands in the sky...');
	
	// Clear any existing board content
	while (boardGroup.children.length > 0) {
		boardGroup.remove(boardGroup.children[0]);
	}
	
	// Create the floating cells
	const boardSize = gameState.boardSize || 16;
	
	// Create material for cells - use more natural colors
	const whiteMaterial = new THREE.MeshStandardMaterial({ 
		color: 0xf5f5f5,
		roughness: 0.8,
		metalness: 0.1
	});
	
	const darkMaterial = new THREE.MeshStandardMaterial({ 
		color: 0x3a3a3a,
		roughness: 0.7, 
		metalness: 0.2
	});
	
	// Check if there's board data
	const hasBoardData = gameState.board && 
						Array.isArray(gameState.board) && 
						gameState.board.length > 0;
	
	// Create the cells as floating islands
	for (let z = 0; z < boardSize; z++) {
		for (let x = 0; x < boardSize; x++) {
			// Only create cells where there's data from the server
			// If we don't have board data yet, only create cells in a sparser pattern
			if (!hasBoardData) {
				// Skip cells in a sparser pattern when no board data
				if ((z % 2 === 0 && x % 2 === 0) || (z % 3 === 0 && x % 3 === 0)) {
					// Create floating islands
					createFloatingIsland(x, z, (x + z) % 2 === 0 ? whiteMaterial : darkMaterial);
				}
			} 
			// If we have board data, only create cells where there's content
			else if (gameState.board[z] && gameState.board[z][x] !== 0) {
				createFloatingIsland(x, z, (x + z) % 2 === 0 ? whiteMaterial : darkMaterial);
			}
		}
	}
	
	// Position board group
	boardGroup.position.set(-boardSize/2 + 0.5, 0, -boardSize/2 + 0.5);
}


/**
 * Create a rounded box geometry for prettier islands
 */
function createRoundedBoxGeometry(width, height, depth, radius, segments) {
	// Start with a BoxGeometry
	const geometry = new THREE.BoxGeometry(
		width - radius * 2,
		height - radius * 2,
		depth - radius * 2,
		segments, segments, segments
	);
	
	// Get the existing vertices
	const positionAttribute = geometry.attributes.position;
	
	// Run through the vertices and add radius to each corner
	for (let i = 0; i < positionAttribute.count; i++) {
		const x = positionAttribute.getX(i);
		const y = positionAttribute.getY(i);
		const z = positionAttribute.getZ(i);
		
		// Calculate the radius vector
		const rx = x < 0 ? -radius : radius;
		const ry = y < 0 ? -radius : radius;
		const rz = z < 0 ? -radius : radius;
		
		// Set the new position
		positionAttribute.setXYZ(i, x + rx, y + ry, z + rz);
	}
	
	// Update the geometry
	geometry.computeVertexNormals();
	
	return geometry;
}

/**
 * Add a decorative border around the board
 */
function addBoardBorder(boardSize) {
	// Create border materials with Russian theme
	const borderMaterial = new THREE.MeshStandardMaterial({
		color: 0xB89B64, // Gold-like color for Russian theme
		roughness: 0.6,
		metalness: 0.4
	});
	
	// Border dimensions
	const borderHeight = 0.4;
	const borderThickness = 0.5;
	
	// Create the four borders
	const borderTop = new THREE.Mesh(
		new THREE.BoxGeometry(boardSize + 2*borderThickness, borderHeight, borderThickness),
		borderMaterial
	);
	borderTop.position.set(0, borderHeight/2 - 0.1, -borderThickness/2);
	
	const borderBottom = new THREE.Mesh(
		new THREE.BoxGeometry(boardSize + 2*borderThickness, borderHeight, borderThickness),
		borderMaterial
	);
	borderBottom.position.set(0, borderHeight/2 - 0.1, boardSize - 0.5 + borderThickness/2);
	
	const borderLeft = new THREE.Mesh(
		new THREE.BoxGeometry(borderThickness, borderHeight, boardSize),
		borderMaterial
	);
	borderLeft.position.set(-borderThickness/2, borderHeight/2 - 0.1, boardSize/2 - 0.5);
	
	const borderRight = new THREE.Mesh(
		new THREE.BoxGeometry(borderThickness, borderHeight, boardSize),
		borderMaterial
	);
	borderRight.position.set(boardSize - 0.5 + borderThickness/2, borderHeight/2 - 0.1, boardSize/2 - 0.5);
	
	// Add borders to board group
	boardGroup.add(borderTop);
	boardGroup.add(borderBottom);
	boardGroup.add(borderLeft);
	boardGroup.add(borderRight);
	
	// Add corner decorations
	addCornerDecorations(boardSize, borderMaterial, borderThickness);
}

/**
 * Add decorative corners to the board
 */
function addCornerDecorations(boardSize, material, borderThickness) {
	// Create corner blocks with Russian-style decoration
	const cornerSize = 1.2;
	const cornerHeight = 0.5;
	
	// Corner positions
	const cornerPositions = [
		{x: -borderThickness, z: -borderThickness}, // Top-left
		{x: boardSize - 0.5 + borderThickness, z: -borderThickness}, // Top-right
		{x: -borderThickness, z: boardSize - 0.5 + borderThickness}, // Bottom-left
		{x: boardSize - 0.5 + borderThickness, z: boardSize - 0.5 + borderThickness} // Bottom-right
	];
	
	cornerPositions.forEach((pos, index) => {
		// Create corner base
		const cornerBase = new THREE.Mesh(
			new THREE.BoxGeometry(cornerSize, cornerHeight, cornerSize),
			material
		);
		cornerBase.position.set(pos.x, cornerHeight/2 - 0.1, pos.z);
		
		// Create corner decoration - a small dome or sphere
		const cornerDecoration = new THREE.Mesh(
			new THREE.SphereGeometry(cornerSize/2, 16, 16, 0, Math.PI * 2, 0, Math.PI/2),
			new THREE.MeshStandardMaterial({
				color: 0xAA8844, // Darker gold for decoration
				roughness: 0.4,
				metalness: 0.6
			})
		);
		cornerDecoration.position.set(pos.x, cornerHeight - 0.1, pos.z);
		cornerDecoration.rotation.x = Math.PI;
		
		boardGroup.add(cornerBase);
		boardGroup.add(cornerDecoration);
	});
}

/**
 * Set up input handlers for keyboard and mouse
 */
function setupInputHandlers() {
	console.log('Setting up enhanced input handlers...');
	
	// Keyboard events
	document.addEventListener('keydown', handleKeyDown);
	
	// Mouse events
	containerElement.addEventListener('mousedown', handleMouseDown);
	containerElement.addEventListener('mousemove', handleMouseMove);
	
	// Add touch support for mobile
	containerElement.addEventListener('touchstart', handleTouchStart, { passive: false });
	containerElement.addEventListener('touchmove', handleTouchMove, { passive: false });
	containerElement.addEventListener('touchend', handleTouchEnd, { passive: false });
}

/**
 * Handle keyboard input
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
	// Only handle keyboard if we're in tetris phase
	if (gameState.turnPhase !== 'tetris' || !gameState.currentTetromino) {
		return;
	}
	
	// Handle tetromino movement and rotation
	switch (event.key) {
		case 'ArrowLeft':
			// Move tetromino left
			console.log('Move left');
			// Implement tetromino movement
			break;
		case 'ArrowRight':
			// Move tetromino right
			console.log('Move right');
			// Implement tetromino movement
			break;
		case 'ArrowDown':
			// Move tetromino down
			console.log('Move down');
			// Implement tetromino movement
			break;
		case 'ArrowUp':
			// Move tetromino up
			console.log('Move up');
			// Implement tetromino movement
			break;
		case 'z':
		case 'Z':
			// Rotate tetromino counterclockwise
			console.log('Rotate CCW');
			// Implement tetromino rotation
			break;
		case 'x':
		case 'X':
			// Rotate tetromino clockwise
			console.log('Rotate CW');
			// Implement tetromino rotation
			break;
		case ' ':
			// Hard drop tetromino
			console.log('Hard drop');
			// Implement hard drop
			break;
	}
}

/**
 * Handle mouse down event
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseDown(event) {
	// Calculate mouse position in normalized device coordinates (-1 to +1)
	const rect = containerElement.getBoundingClientRect();
	mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	
	// Only handle mouse if we're in chess phase
	if (gameState.turnPhase !== 'chess') {
		return;
	}
	
	// Implement ray casting for chess piece selection and movement
	performRaycast();
}

/**
 * Handle mouse move event
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseMove(event) {
	// Calculate mouse position for hover effects
	const rect = containerElement.getBoundingClientRect();
	mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

/**
 * Handle touch start event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchStart(event) {
	event.preventDefault();
	
	if (event.touches.length > 0) {
		const rect = containerElement.getBoundingClientRect();
		mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
		
		// Only handle touch if we're in chess phase
		if (gameState.turnPhase !== 'chess') {
			return;
		}
		
		// Implement ray casting for chess piece selection and movement
		performRaycast();
	}
}

/**
 * Handle touch move event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchMove(event) {
	event.preventDefault();
	
	if (event.touches.length > 0) {
		const rect = containerElement.getBoundingClientRect();
		mouse.x = ((event.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
		mouse.y = -((event.touches[0].clientY - rect.top) / rect.height) * 2 + 1;
	}
}

/**
 * Handle touch end event
 * @param {TouchEvent} event - Touch event
 */
function handleTouchEnd(event) {
	event.preventDefault();
}

/**
 * Perform raycasting for object interaction
 */
function performRaycast() {
	// Set up raycaster
	raycaster.setFromCamera(mouse, camera);
	
	// Get intersections with board and pieces
	const intersects = raycaster.intersectObjects([boardGroup, chessPiecesGroup], true);
	
	// Handle intersections
	if (intersects.length > 0) {
		const intersectedObject = intersects[0].object;
		
		// Check if we hit a cell or a piece
		if (intersectedObject.userData && intersectedObject.userData.type === 'cell') {
			console.log('Clicked on cell:', intersectedObject.userData.position);
			// Handle cell click (move chess piece)
		} else if (intersectedObject.userData && intersectedObject.userData.type === 'chessPiece') {
			console.log('Clicked on chess piece:', intersectedObject.userData);
			// Handle chess piece selection
		}
	}
}

/**
 * Start the game loop
 */
function startGameLoop() {
	console.log('Starting enhanced game loop...');
	
	// Last time for calculating delta time
	let lastTime = performance.now();
	
	// Animation loop function
	function animate() {
		// Request next frame
		requestAnimationFrame(animate);
		
		// Calculate delta time
		const currentTime = performance.now();
		const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
		lastTime = currentTime;
		
		// Update controls if available
		if (controls) {
			controls.update();
		}
		
		// Animate clouds
		animateClouds();
		
		// Update any game logic that needs to run every frame
		updateGameLogic(deltaTime);
		
		// Render the scene
		renderer.render(scene, camera);
	}
	
	// Start animation loop
	animate();
}

/**
 * Update game logic on each frame
 * @param {number} deltaTime - Time since last frame in seconds
 */
function updateGameLogic(deltaTime) {
	// Check if we need to position camera based on home zone data
	if (gameState.pendingCameraReset) {
		// If NetworkManager has stored game state with home zones, use it
		if (NetworkManager.getCurrentGameState) {
			const netState = NetworkManager.getCurrentGameState();
			if (netState && netState.homeZones && Object.keys(netState.homeZones).length > 0) {
				// We have home zone data now, update our state
				gameState.homeZones = netState.homeZones;
				
				console.log('Retrieved home zones from NetworkManager, positioning camera');
				resetCameraBasedOnHomeZone();
				gameState.pendingCameraReset = null;
			}
		}
		
		// If we've waited too long, position camera anyway
		const now = Date.now();
		if (gameState.pendingCameraReset?.timestamp && 
			(now - gameState.pendingCameraReset?.timestamp > 5000)) {
			console.log('Timeout waiting for home zone data, positioning camera with defaults');
			positionCameraDefault();
			gameState.pendingCameraReset = null;
		}
	}
	
	// Animate visual effects
	if (gameState.effects && gameState.effects.length > 0) {
		const now = Date.now();
		
		// Process all effects
		for (let i = gameState.effects.length - 1; i >= 0; i--) {
			const effect = gameState.effects[i];
			const age = now - effect.createTime;
			
			// Check if effect has expired
			if (age > effect.lifetime) {
				// Remove from scene
				if (effect.object.parent) {
					effect.object.parent.remove(effect.object);
				}
				
				// Remove from effects list
				gameState.effects.splice(i, 1);
				continue;
			}
			
			// Calculate progress for animation (0-1)
			const progress = age / effect.lifetime;
			
			// Animate based on effect type
			if (effect.type === 'particles') {
				// Animate particles
				effect.object.children.forEach(particle => {
					// Move based on velocity
					particle.position.x += particle.userData.velocity.x;
					particle.position.y += particle.userData.velocity.y;
					particle.position.z += particle.userData.velocity.z;
					
					// Apply gravity
					particle.userData.velocity.y -= 0.01;
					
					// Fade out
					if (particle.material) {
						particle.material.opacity = 0.7 * (1 - progress);
					}
					
					// Shrink slightly
					const scale = 1 - (progress * 0.5);
					particle.scale.set(scale, scale, scale);
				});
			}
		}
	}
}

/**
 * Position camera based on home zone data
 */
function resetCameraBasedOnHomeZone() {
	if (!camera || !controls) return;
	
	// Default position in case we can't find home zone
	let targetPosition = { x: 5, y: 15, z: 25 };
	let lookAt = { x: 5, y: 0, z: 12 };
	
	// Try to find the player's home zone
	if (gameState.homeZones && Object.keys(gameState.homeZones).length > 0) {
		// Get player ID if possible
		const playerId = NetworkManager.getPlayerId ? NetworkManager.getPlayerId() : null;
		let homeZone = null;
		
		if (playerId) {
			// Look for player's home zone
			for (const [id, zone] of Object.entries(gameState.homeZones)) {
				if (id === playerId || id.includes(playerId) || playerId.includes(id)) {
					homeZone = zone;
					break;
				}
			}
		}
		
		// If no matching zone found, use first one
		if (!homeZone) {
			homeZone = Object.values(gameState.homeZones)[0];
		}
		
		if (homeZone) {
			// Position camera at angle to home zone
			targetPosition = {
				x: homeZone.x - 5,
				y: 15,
				z: homeZone.z + 10
			};
			
			lookAt = {
				x: homeZone.x + (homeZone.width ? homeZone.width/2 : 2),
				y: 0,
				z: homeZone.z + (homeZone.height ? homeZone.height/2 : 2)
			};
			
			console.log('Positioning camera based on home zone:', homeZone);
		}
	}
	
	// Animate camera movement
	animateCamera(targetPosition, lookAt);
}

/**
 * Position camera at default position
 */
function positionCameraDefault() {
	if (!camera || !controls) return;
	
	const targetPosition = { x: 8, y: 20, z: 25 };
	const lookAt = { x: 0, y: 0, z: 0 };
	
	// Animate camera movement
	animateCamera(targetPosition, lookAt);
}

/**
 * Animate camera to target position
 * @param {Object} targetPosition - Target camera position
 * @param {Object} lookAt - Target look-at point
 */
function animateCamera(targetPosition, lookAt) {
	// Get current position
	const startPosition = {
		x: camera.position.x,
		y: camera.position.y,
		z: camera.position.z
	};
	
	// Get current look-at
	const startLookAt = controls.target.clone();
	
	// Animation duration
	const duration = 2000; // 2 seconds
	const startTime = Date.now();
	
	// Animate camera movement
	function animate() {
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);
		
		// Ease function (cubic)
		const ease = 1 - Math.pow(1 - progress, 3);
		
		// Update camera position
		camera.position.x = startPosition.x + (targetPosition.x - startPosition.x) * ease;
		camera.position.y = startPosition.y + (targetPosition.y - startPosition.y) * ease;
		camera.position.z = startPosition.z + (targetPosition.z - startPosition.z) * ease;
		
		// Update controls target
		controls.target.x = startLookAt.x + (lookAt.x - startLookAt.x) * ease;
		controls.target.y = startLookAt.y + (lookAt.y - startLookAt.y) * ease;
		controls.target.z = startLookAt.z + (lookAt.z - startLookAt.z) * ease;
		
		// Update controls
		controls.update();
		
		// Force renderer update
		if (renderer && scene) {
			renderer.render(scene, camera);
		}
		
		// Continue animation if not done
		if (progress < 1) {
			requestAnimationFrame(animate);
		}
	}
	
	// Start animation
	animate();
}

/**
 * Set up network event listeners
 */
function setupNetworkEvents() {
	console.log('Setting up network events...');
	
	if (typeof NetworkManager !== 'undefined') {
		try {
			// Connection events
			NetworkManager.addEventListener('connect', () => {
				console.log('Connected to server');
				updateNetworkStatus('connected');
				
				// Update game ID display if available
				if (NetworkManager.getGameId && NetworkManager.getGameId()) {
					updateGameIdDisplay(NetworkManager.getGameId());
				}
			});
			
			NetworkManager.addEventListener('disconnect', () => {
				console.log('Disconnected from server');
				updateNetworkStatus('disconnected');
			});
			
			// Game state updates - this is the main way we receive game data
			NetworkManager.addEventListener('game_state', (data) => {
				console.log('Game state update received:', data);
				if (data) {
					handleGameStateUpdate(data);
				}
			});
			
			// Smaller incremental updates
			NetworkManager.addEventListener('game_update', (data) => {
				console.log('Game update received:', data);
				if (data) {
					handleGameUpdate(data);
				}
			});
			
			// Player events
			NetworkManager.addEventListener('player_joined', (data) => {
				if (data && data.playerName) {
					console.log('Player joined:', data);
					showToastMessage(`Player ${data.playerName} joined the game`);
				}
			});
			
			NetworkManager.addEventListener('player_left', (data) => {
				if (data && data.playerName) {
					console.log('Player left:', data);
					showToastMessage(`Player ${data.playerName} left the game`);
				}
			});
			
			// General messages
			NetworkManager.addEventListener('message', (data) => {
				console.log('Message received:', data);
				// Handle based on type
				if (data.type && data.payload) {
					switch (data.type) {
						case 'game_state':
							handleGameStateUpdate(data.payload);
							break;
						case 'game_update':
							handleGameUpdate(data.payload);
							break;
						case 'player_joined':
							if (data.payload && data.payload.playerName) {
								showToastMessage(`Player ${data.payload.playerName} joined the game`);
							}
							break;
						case 'player_left':
							if (data.payload && data.payload.playerName) {
								showToastMessage(`Player ${data.payload.playerName} left the game`);
							}
							break;
					}
				}
			});
			
			console.log('Network event listeners set up successfully');
		} catch (error) {
			console.error('Error setting up network event listeners:', error);
		}
	} else {
		console.warn('NetworkManager not available, skipping network event setup');
	}
}

/**
 * Handle incremental game updates from the server (small changes)
 * @param {Object} data - Update data containing parts of the game state
 */
function handleGameUpdate(data) {
	// Apply partial updates to the game state
	if (data.board) {
		// Instead of full logging, just log count of changed cells
		if (data.boardChanges) {
			// Process incremental updates
			updateBoardStateIncremental(data.boardChanges);
		} else {
			// Full board update as fallback
			updateBoardState(data.board);
		}
	}
	
	// Process player updates (joined, left, moved, etc.)
	if (data.players) {
		gameState.players = data.players;
	}
	
	// Update chess pieces if included
	if (data.chessPieces) {
		gameState.chessPieces = data.chessPieces;
		updateChessPieces();
	}
	
	// Handle tetromino placements
	if (data.tetrominoPlacement) {
		processTetromino(data.tetrominoPlacement);
	}
	
	// Update UI based on changes
	updateGameStatusDisplay();
}

/**
 * Handle game state update from the server
 * @param {Object} data - Game state data
 */
function handleGameStateUpdate(data) {
	console.log('Received game state from server:', data);
	
	// Update board state
	if (data.board) {
		console.log('Board data received:', data.board);
		updateBoardState(data.board);
	} else {
		console.warn('No board data in game state update');
	}
	
	// Check for home zones
	if (data.homeZones) {
		console.log('Home zones received:', data.homeZones);
		gameState.homeZones = data.homeZones;
		
		// Reposition camera if there was a pending camera reset
		if (gameState.pendingCameraReset) {
			console.log('Executing pending camera reset with home zone data');
			// Wait a moment for board updates to complete
			setTimeout(() => {
				resetCameraForGameplay(gameState.pendingCameraReset.animate);
				gameState.pendingCameraReset = null;
			}, 300);
		}
	}
	
	// Update player list
	if (data.players) {
		console.log('Players received:', data.players);
		
		// Update local game state players
		gameState.players = data.players;
	}
	
	// Update current player and turn phase
	if (data.currentPlayer) {
		gameState.currentPlayer = data.currentPlayer;
	}
	
	if (data.turnPhase) {
		gameState.turnPhase = data.turnPhase;
	}
	
	// Update UI
	updateGameStatusDisplay();
}

/**
 * Update game ID display
 * @param {string} gameId - Game ID
 */
function updateGameIdDisplay(gameId) {
	const gameIdDisplay = document.getElementById('game-id-display');
	if (gameIdDisplay) {
		gameIdDisplay.value = gameId;
	}
}

/**
 * Update the board state based on server data
 * @param {Array} boardData - 2D array of board cell data
 */
function updateBoardState(boardData) {
	if (!boardData || !Array.isArray(boardData)) {
		console.error('Invalid board data received');
		return;
	}
	
	// Check if board size has changed
	const newBoardSize = boardData.length;
	if (newBoardSize !== gameState.boardSize) {
		console.log(`Board size changed from ${gameState.boardSize} to ${newBoardSize}`);
		gameState.boardSize = newBoardSize;
		
		// Recreate the board with new size
		createBoard();
	}
	
	// Update local game state board
	gameState.board = boardData;
	
	// Count non-empty cells without excessive logging
	let nonEmptyCells = 0;
	let chessCells = 0;
	
	// Look for any problematic cells and log diagnostics
	for (let z = 0; z < boardData.length; z++) {
		const row = boardData[z];
		if (!row) continue;
		
		for (let x = 0; x < row.length; x++) {
			const cell = row[x];
			if (cell !== 0 && cell !== null) {
				nonEmptyCells++;
				
				// Check for chess cells that might cause errors
				if (typeof cell === 'object' && cell !== null && cell.type === 'chess') {
					chessCells++;
					if (!cell.pieceType) {
						console.warn(`Chess cell missing pieceType at (${x},${z}):`, cell);
						// Add a default pieceType to prevent errors
						cell.pieceType = 'pawn';
					}
				}
			}
		}
	}
	
	// Log summarized info
	console.log(`Board updated with ${nonEmptyCells} non-empty cells, including ${chessCells} chess cells`);
	
	// Once per minute, log detailed board structure for debugging
	const now = Date.now();
	if (!window.lastBoardStructureLog || now - window.lastBoardStructureLog > 60000) {
		logBoardStructure(boardData);
		window.lastBoardStructureLog = now;
	}
	
	// Update the visual representation
	updateBoardVisuals();
}

/**
 * Update board visual representation
 */
function updateBoardVisuals() {
	// Clear existing tetrominos and chess pieces
	while (tetrominoGroup.children.length > 0) {
		tetrominoGroup.remove(tetrominoGroup.children[0]);
	}
	
	while (chessPiecesGroup.children.length > 0) {
		chessPiecesGroup.remove(chessPiecesGroup.children[0]);
	}
	
	// Create base board cells first
	createBoardCells();
	
	// Check if we have valid board data
	if (!gameState.board || !Array.isArray(gameState.board) || gameState.board.length === 0) {
		console.warn('No board data to visualize');
		return;
	}
	
	// Get board size
	const boardSize = gameState.board.length;
	
	// Debug output of the actual board structure
	console.log('Board structure first row sample:', 
		gameState.board.length > 0 ? JSON.stringify(gameState.board[0]) : 'Empty');
	
	// Create visuals for each cell
	for (let z = 0; z < boardSize; z++) {
		const row = gameState.board[z];
		if (!row) continue;
		
		for (let x = 0; x < row.length; x++) {
			const cellType = row[x];
			
			// Skip empty cells
			if (cellType === 0 || cellType === null || cellType === undefined) continue;
			
			// Process based on cell type
			if (typeof cellType === 'object' && cellType !== null) {
				// Handle object-based cell data
				if (cellType.type === 'chess') {
					// Chess piece
					let pieceType = cellType.pieceType || 'pawn';
					const pieceCode = (cellType.player * 10) + getChessPieceTypeCode(pieceType);
					createChessPiece(x, z, pieceCode);
				} else if (cellType.type === 'tetromino') {
					// Tetromino block
					createTetrominoBlock(x, z, cellType.player || 1);
				} else if (cellType.type === 'homeZone') {
					// Home zone
					const zoneType = (cellType.player + 5);
					updateHomeZoneVisual(x, z, zoneType);
				}
			} else if (typeof cellType === 'number') {
				// Handle legacy numeric cell types
				if (cellType >= 1 && cellType <= 5) {
					// Player tetromino placements - create block
					createTetrominoBlock(x, z, cellType);
				} else if (cellType >= 6 && cellType <= 10) {
					// Home zones - add visual indicator
					updateHomeZoneVisual(x, z, cellType);
				} else if (cellType >= 11) {
					// Chess pieces - create piece
					createChessPiece(x, z, cellType);
				}
			}
		}
	}
	
	// Now that we've processed the board, also update chess pieces from separate array if available
	if (gameState.chessPieces && Array.isArray(gameState.chessPieces)) {
		updateChessPieces();
	}
}

/**
 * Create a base grid of board cells
 */
function createBoardCells() {
	// Clear existing board first
	const boardElements = boardGroup.children.filter(child => 
		child.userData && child.userData.type === 'cell');
	
	for (const element of boardElements) {
		boardGroup.remove(element);
	}
	
	// Create base grid of cells
	const boardSize = gameState.boardSize || 30;
	
	// Create basic materials
	const whiteMaterial = new THREE.MeshStandardMaterial({ 
		color: 0xf5f5f5,
		roughness: 0.8,
		metalness: 0.1
	});
	
	const darkMaterial = new THREE.MeshStandardMaterial({ 
		color: 0x3a3a3a,
		roughness: 0.7, 
		metalness: 0.2
	});
	
	// Create a 8x8 grid of cells at minimum
	const minGridSize = 8;
	const gridSize = Math.max(boardSize, minGridSize);
	
	// Calculate board center
	const center = gridSize / 2 - 0.5;
	
	// Create cells
	for (let z = 0; z < gridSize; z++) {
		for (let x = 0; x < gridSize; x++) {
			// Create cell at checkerboard pattern
			if (((x + z) % 2 === 0) || 
				// Also create cells for non-empty positions
				(gameState.board && 
				 gameState.board[z] && 
				 gameState.board[z][x] !== 0 && 
				 gameState.board[z][x] !== null && 
				 gameState.board[z][x] !== undefined)) {
					 
				// Choose material based on checkerboard pattern
				const material = (x + z) % 2 === 0 ? whiteMaterial : darkMaterial;
				
				// Create floating island with slightly less vertical offset
				const island = createFloatingIsland(x, z, material, 0.3);
				
				// Position relative to center
				island.position.x = x - center;
				island.position.z = z - center;
				island.position.y = -0.5; // Move lower to create flat board
			}
		}
	}
}

/**
 * Convert chess piece type string to numeric code
 * @param {string} pieceType - Chess piece type name
 * @returns {number} - Numeric code for the piece type
 */
function getChessPieceTypeCode(pieceType) {
	const pieceTypes = {
		'pawn': 1,
		'rook': 2,
		'knight': 3,
		'bishop': 4,
		'queen': 5,
		'king': 6
	};
	
	return pieceTypes[pieceType.toLowerCase()] || 1;
}

/**
 * Convert chess piece type string to numeric code
 * @param {string} pieceType - Chess piece type name
 * @returns {number} - Numeric code for the piece type
 */
function getChessPieceTypeCode(pieceType) {
	try {
		const pieceTypes = {
			'pawn': 1,
			'rook': 2,
			'knight': 3,
			'bishop': 4,
			'queen': 5,
			'king': 6
		};
		
		// Handle undefined or null pieceType
		if (!pieceType) {
			console.warn('Undefined pieceType in getChessPieceTypeCode, using default (pawn)');
			return 1;
		}
		
		return pieceTypes[pieceType.toLowerCase()] || 1;
	} catch (error) {
		console.error('Error in getChessPieceTypeCode:', error);
		return 1; // Default to pawn
	}
}

/**
 * Convert chess piece type string to numeric code
 * @param {string} pieceType - Chess piece type name
 * @returns {number} - Numeric code for the piece type
 */
function getChessPieceTypeCode(pieceType) {
	try {
		const pieceTypes = {
			'pawn': 1,
			'rook': 2,
			'knight': 3,
			'bishop': 4,
			'queen': 5,
			'king': 6
		};
		
		// Handle undefined or null pieceType
		if (!pieceType) {
			console.warn('Undefined pieceType in getChessPieceTypeCode, using default (pawn)');
			return 1;
		}
		
		return pieceTypes[pieceType.toLowerCase()] || 1;
	} catch (error) {
		console.error('Error in getChessPieceTypeCode:', error);
		return 1; // Default to pawn
	}
}

/**
 * Create a tetromino block visualization
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} playerType - Player type (1-5)
 */
function createTetrominoBlock(x, z, playerType) {
	// Create geometry for block
	const blockGeometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
	
	// Get material based on player type
	let blockMaterial;
	
	// Use player cell texture if available
	if (textures.cells[playerType]) {
		blockMaterial = new THREE.MeshStandardMaterial({ 
			map: textures.cells[playerType],
			roughness: 0.7,
			metalness: 0.3
		});
	} else {
		// Fallback to color
		const color = PLAYER_COLORS[playerType] || 0xcccccc;
		blockMaterial = new THREE.MeshStandardMaterial({ 
			color: color,
			roughness: 0.7,
			metalness: 0.3
		});
	}
	
	// Create block mesh
	const block = new THREE.Mesh(blockGeometry, blockMaterial);
	block.position.set(x - gameState.boardSize/2 + 0.5, 0.45, z - gameState.boardSize/2 + 0.5);
	block.castShadow = true;
	block.receiveShadow = true;
	
	// Add to tetromino group
	tetrominoGroup.add(block);
}

/**
 * Update home zone visual indication
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} zoneType - Home zone type (6-10)
 */
function updateHomeZoneVisual(x, z, zoneType) {
	// Create a thin plate to indicate home zone
	const zoneGeometry = new THREE.PlaneGeometry(0.95, 0.95);
	
	// Get material based on zone type (subtracting 5 to get player index 1-5)
	const playerType = zoneType - 5;
	
	// Use home zone texture if available
	let zoneMaterial;
	if (textures.cells[zoneType]) {
		zoneMaterial = new THREE.MeshStandardMaterial({ 
			map: textures.cells[zoneType],
			transparent: true,
			opacity: 0.7,
			side: THREE.DoubleSide
		});
	} else {
		// Fallback to color
		const color = PLAYER_COLORS[playerType] || 0xcccccc;
		zoneMaterial = new THREE.MeshStandardMaterial({ 
			color: color,
			transparent: true,
			opacity: 0.5,
			side: THREE.DoubleSide
		});
	}
	
	// Create zone mesh
	const zone = new THREE.Mesh(zoneGeometry, zoneMaterial);
	zone.rotation.x = -Math.PI / 2; // Lay flat on the board
	zone.position.set(x - gameState.boardSize/2 + 0.5, 0.05, z - gameState.boardSize/2 + 0.5);
	
	// Add to board group
	boardGroup.add(zone);
}

/**
 * Create a chess piece visualization
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} pieceType - Chess piece type
 */
function createChessPiece(x, z, pieceType) {
	try {
		// Verify parameters for debugging
		if (pieceType === undefined || pieceType === null) {
			console.warn(`Invalid pieceType (${pieceType}) for cell at (${x},${z}), using default`);
			pieceType = 11; // Default to player 1 pawn
		}
		
		// Determine piece properties from type
		// pieceType format: XY where X is player (1-4) and Y is piece type (1-6)
		const player = Math.floor(pieceType / 10);
		const type = pieceType % 10;
		
		// Map piece type to name
		const pieceNames = {
			1: 'pawn',
			2: 'rook',
			3: 'knight',
			4: 'bishop',
			5: 'queen',
			6: 'king'
		};
		
		const pieceName = pieceNames[type] || 'pawn';
		
		// Get model if available
		let pieceModel;
		if (models.pieces[player] && models.pieces[player][pieceName]) {
			pieceModel = models.pieces[player][pieceName].clone();
		} else {
			// Fallback if model not available
			const color = PLAYER_COLORS[player] || 0xcccccc;
			pieceModel = createPlaceholderPiece(pieceName, color);
		}
		
		// Position piece
		pieceModel.position.set(x - gameState.boardSize/2 + 0.5, 0, z - gameState.boardSize/2 + 0.5);
		
		// Store piece info for raycasting
		pieceModel.userData = {
			type: 'chessPiece',
			pieceType: pieceName,
			player: player,
			position: { x, z }
		};
		
		// Add to chess pieces group
		chessPiecesGroup.add(pieceModel);
	} catch (error) {
		console.error(`Error creating chess piece at (${x},${z}) with type ${pieceType}:`, error);
		// Create a fallback piece using a simple red cube to show the error
		const errorGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
		const errorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
		const errorMesh = new THREE.Mesh(errorGeometry, errorMaterial);
		errorMesh.position.set(x - gameState.boardSize/2 + 0.5, 0.5, z - gameState.boardSize/2 + 0.5);
		chessPiecesGroup.add(errorMesh);
	}
}

/**
 * Create a placeholder piece if model is not available
 * Add distant background clouds using simple planes
 */
function addBackgroundClouds() {
	const backgroundCloudCount = 35; // More clouds
	const backgroundCloudMaterial = new THREE.MeshBasicMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 0.7,
		side: THREE.DoubleSide
	});
	
	for (let i = 0; i < backgroundCloudCount; i++) {
		// Create a simple plane for each cloud with random size
		const cloudWidth = Math.random() * 80 + 40;
		const cloudHeight = Math.random() * 30 + 20;
		const cloudGeometry = new THREE.PlaneGeometry(cloudWidth, cloudHeight);
		const cloud = new THREE.Mesh(cloudGeometry, backgroundCloudMaterial);
		
		// Position the cloud randomly in the sky at a large distance but lower height
		const distance = Math.random() * 300 + 300;
		const angle = Math.random() * Math.PI * 2;
		const height = Math.random() * 60 + 30; // Lower heights (30-90 instead of 50-170)
		
		cloud.position.set(
			Math.cos(angle) * distance,
			height,
			Math.sin(angle) * distance
		);
		
		// Rotate to face center approximately
		cloud.lookAt(0, cloud.position.y, 0);
		
		// Add some variation to the rotation
		cloud.rotation.z = Math.random() * Math.PI * 2;
		
		// Store movement for subtle animation
		cloud.userData.speed = 0.001 + Math.random() * 0.001; // Very slow movement
		cloud.userData.direction = new THREE.Vector2(
			(Math.random() - 0.5) * 0.001,
			(Math.random() - 0.5) * 0.001
		);
		cloud.userData.isBackgroundCloud = true;
		
		clouds.add(cloud);
	}
}

/**
 * Pause the game (used when network connection is lost)
 */
export function pauseGame() {
	console.log('Pausing game due to network disconnection');
	
	// If we're already in a paused state, don't do anything
	if (gameState.isPaused) {
		return;
	}
	
	// Set pause flag
	gameState.isPaused = true;
	
	// Add semi-transparent overlay to indicate paused state
	const gameContainer = document.getElementById('game-container');
	let pauseOverlay = document.getElementById('pause-overlay');
	
	if (!pauseOverlay) {
		pauseOverlay = document.createElement('div');
		pauseOverlay.id = 'pause-overlay';
		pauseOverlay.style.position = 'absolute';
		pauseOverlay.style.top = '0';
		pauseOverlay.style.left = '0';
		pauseOverlay.style.width = '100%';
		pauseOverlay.style.height = '100%';
		pauseOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		pauseOverlay.style.display = 'flex';
		pauseOverlay.style.justifyContent = 'center';
		pauseOverlay.style.alignItems = 'center';
		pauseOverlay.style.zIndex = '100';
		pauseOverlay.style.color = 'white';
		pauseOverlay.style.fontSize = '24px';
		pauseOverlay.innerHTML = '<div>Game Paused - Waiting for network connection</div>';
		
		gameContainer.appendChild(pauseOverlay);
	} else {
		pauseOverlay.style.display = 'flex';
	}
	
	// Stop any active game loops or animations
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
}

/**
 * Resume the game (used when network connection is restored)
 */
export function resumeGame() {
	console.log('Resuming game after network reconnection');
	
	// If we're not in a paused state, don't do anything
	if (!gameState.isPaused) {
		return;
	}
	
	// Clear pause flag
	gameState.isPaused = false;
	
	// Remove the pause overlay
	const pauseOverlay = document.getElementById('pause-overlay');
	if (pauseOverlay) {
		pauseOverlay.style.display = 'none';
	}
	
	// Restart the animation loop
	if (!animationFrameId) {
		animationFrameId = requestAnimationFrame(animate);
	}
}

/**
 * Update chess pieces visuals based on the current game state
 */
function updateChessPieces() {
	// Clear existing chess pieces
	while (chessPiecesGroup.children.length > 0) {
		chessPiecesGroup.remove(chessPiecesGroup.children[0]);
	}
	
	// No chess pieces to display
	if (!gameState.chessPieces || !Array.isArray(gameState.chessPieces)) {
		console.warn('No chess pieces data available');
		return;
	}
	
	console.log(`Updating ${gameState.chessPieces.length} chess pieces visuals`);
	
	// Create visuals for each chess piece
	for (const piece of gameState.chessPieces) {
		if (!piece || !piece.position) continue;
		
		const x = piece.position.x;
		const z = piece.position.z || piece.position.y; // Handle different coordinate systems
		
		// Create pieceType from player and type info
		const pieceCode = (piece.player * 10) + piece.type;
		
		// Create visual representation
		createChessPiece(x, z, pieceCode);
	}
}

/**
 * Process tetromino placement from another player
 * @param {Object} tetrominoData - Data about the tetromino placement
 */
function processTetromino(tetrominoData) {
	if (!tetrominoData || !tetrominoData.shape || !tetrominoData.position) {
		console.warn('Invalid tetromino data received:', tetrominoData);
		return;
	}
	
	console.log('Processing tetromino placement:', tetrominoData);
	
	// Extract data
	const { shape, position, player } = tetrominoData;
	const playerType = player || tetrominoData.player || 1;
	
	// Get shape matrix - handle both shape name (I, L, etc) and direct matrix
	let shapeMatrix;
	if (typeof shape === 'string' && TETROMINO_SHAPES[shape]) {
		shapeMatrix = TETROMINO_SHAPES[shape];
	} else if (Array.isArray(shape)) {
		shapeMatrix = shape;
	} else {
		console.warn('Unknown tetromino shape:', shape);
		return;
	}
	
	// Place the tetromino in the board visually
	const { x, y, z } = position;
	
	// In case we have y and z swapped in different coordinate systems
	const zPos = z !== undefined ? z : y;
	
	// Add to the board matrix
	placeTetromino(shapeMatrix, x, zPos, playerType);
	
	// Play a sound effect if available
	if (window.SoundManager && SoundManager.playSound) {
		SoundManager.playSound('place');
	}
	
	// Optionally add a visual effect
	addPlacementEffect(x, zPos);
}

/**
 * Add a visual effect for tetromino placement
 * @param {number} x - X position
 * @param {number} z - Z position
 */
function addPlacementEffect(x, z) {
	// Only add effect if THREE.js components are available
	if (!scene) return;
	
	// Create a small particle burst
	const particles = new THREE.Group();
	particles.position.set(
		x - gameState.boardSize/2 + 0.5, 
		0.5, 
		z - gameState.boardSize/2 + 0.5
	);
	
	// Add 10 small particles
	for (let i = 0; i < 10; i++) {
		const geometry = new THREE.SphereGeometry(0.1, 8, 8);
		const material = new THREE.MeshBasicMaterial({
			color: 0xFFFFFF,
			transparent: true,
			opacity: 0.7
		});
		
		const particle = new THREE.Mesh(geometry, material);
		
		// Random initial position near center
		particle.position.set(
			(Math.random() - 0.5) * 0.5,
			(Math.random() - 0.5) * 0.5,
			(Math.random() - 0.5) * 0.5
		);
		
		// Random velocity
		particle.userData.velocity = new THREE.Vector3(
			(Math.random() - 0.5) * 0.1,
			Math.random() * 0.2,
			(Math.random() - 0.5) * 0.1
		);
		
		// Store creation time for animation
		particle.userData.createTime = Date.now();
		particle.userData.lifetime = 1000 + Math.random() * 500; // 1-1.5 seconds
		
		particles.add(particle);
	}
	
	// Add to scene
	scene.add(particles);
	
	// Store for animation
	if (!gameState.effects) {
		gameState.effects = [];
	}
	gameState.effects.push({
		type: 'particles',
		object: particles,
		createTime: Date.now(),
		lifetime: 1500 // 1.5 seconds
	});
}

/**
 * Update board state incrementally with only changed cells
 * @param {Array} changes - Array of cell changes with format {id, x, z, value}
 */
function updateBoardStateIncremental(changes) {
	if (!changes || !Array.isArray(changes) || changes.length === 0) {
		return;
	}
	
	// Ensure board exists
	if (!gameState.board) {
		console.warn("Cannot apply incremental updates to non-existent board");
		return;
	}
	
	// Track if we need to expand the board
	let needsBoardRebuild = false;
	let maxX = gameState.boardSize - 1;
	let maxZ = gameState.boardSize - 1;
	
	// Apply each change
	let changedCells = 0;
	for (const change of changes) {
		// Extract change details
		const { x, z, value } = change;
		
		// Check if coordinates are outside current board
		if (x > maxX || z > maxZ || x < 0 || z < 0) {
			needsBoardRebuild = true;
			maxX = Math.max(maxX, x);
			maxZ = Math.max(maxZ, z);
			continue;
		}
		
		// Apply change to our board
		if (!gameState.board[z]) {
			gameState.board[z] = [];
		}
		gameState.board[z][x] = value;
		changedCells++;
	}
	
	console.log(`Applied ${changedCells} incremental board changes`);
	
	// If board needs to be expanded, request a full board update
	if (needsBoardRebuild) {
		console.log(`Board expansion needed - requesting full board update`);
		requestGameState();
		return;
	}
	
	// Update visuals for changed cells only
	updateBoardVisuals();
}

/**
 * Log detailed board structure for debugging
 * @param {Array} board - The board data to analyze
 */
function logBoardStructure(board) {
	if (!board || !Array.isArray(board)) return;
	
	console.group('Board Structure Analysis');
	console.log('Board dimensions:', board.length, 'x', board[0]?.length || 0);
	
	// Count different types of cells
	const counts = {
		total: 0,
		empty: 0,
		null: 0,
		number: 0,
		object: 0,
		chess: 0,
		tetromino: 0,
		homeZone: 0,
		other: 0
	};
	
	// Sample cells for detailed examination
	const samples = {
		number: null,
		chess: null,
		tetromino: null,
		homeZone: null,
		other: null
	};
	
	// Analyze board data
	for (let z = 0; z < board.length; z++) {
		const row = board[z];
		if (!row) continue;
		
		for (let x = 0; x < row.length; x++) {
			const cell = row[x];
			counts.total++;
			
			if (cell === 0) {
				counts.empty++;
			} else if (cell === null) {
				counts.null++;
			} else if (typeof cell === 'number') {
				counts.number++;
				if (!samples.number) samples.number = { pos: [x, z], value: cell };
			} else if (typeof cell === 'object' && cell !== null) {
				counts.object++;
				
				if (cell.type === 'chess') {
					counts.chess++;
					if (!samples.chess) samples.chess = { pos: [x, z], value: cell };
				} else if (cell.type === 'tetromino') {
					counts.tetromino++;
					if (!samples.tetromino) samples.tetromino = { pos: [x, z], value: cell };
				} else if (cell.type === 'homeZone') {
					counts.homeZone++;
					if (!samples.homeZone) samples.homeZone = { pos: [x, z], value: cell };
				} else {
					counts.other++;
					if (!samples.other) samples.other = { pos: [x, z], value: cell };
				}
			}
		}
	}
	
	// Log counts
	console.log('Cell counts:', counts);
	
	// Log samples
	console.log('Cell samples:');
	for (const [type, sample] of Object.entries(samples)) {
		if (sample) {
			console.log(`- ${type} at (${sample.pos[0]}, ${sample.pos[1]}):`, sample.value);
		}
	}
	
	console.groupEnd();
}
