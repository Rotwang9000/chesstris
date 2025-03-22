/**
 * Game Renderer Utility
 *
 * Handles rendering of game elements for both 2D and 3D modes
 */

// Constants for rendering
const RENDER_MODES = {
	MODE_2D: '2d',
	MODE_3D: '3d'
};

// Default rendering settings
const DEFAULT_SETTINGS = {
	mode: RENDER_MODES.MODE_3D,
	cellSize: 1,
	boardPadding: 0.5,
	animationSpeed: 1.0,
	showGrid: true,
	showShadows: true,
	showGhostPiece: true,
	highlightValidMoves: true,
	theme: 'default',
	quality: 'medium'
};
let _verbose = false;
// Global state variables
let _isInitialized = false;
let _options = {
	verbose: false,
	renderMode: '3d',
	showGrid: true,
	showShadows: true
};


// Renderer components
let canvas = null;
let context = null;
let renderer = null;
let scene = null;
let camera = null;
let controls = null;
let gridHelperObj = null;

// Performance tracking
let animationFrameId = null;
let lastFrameTime = 0;
let framesThisSecond = 0;
let currentFps = 0;
let frameCount = 0;
let lastFpsUpdate = 0;
let isRenderLoopRunning = false;
let frameLimiterActive = true;

// Game state
let currentGameState = null;
let is3DMode = true;
let settings = { ...DEFAULT_SETTINGS };
let debugMode = false;

// Animation tracking
const activeAnimations = {
	floatingCells: [],
	particles: [],
	tetrominoAttach: [],
	tetrominoDisintegrate: [],
	rowClearing: [],
	validMoveHighlights: []
};

// Animation variables
let victoryAnimation = null;
let defeatAnimation = null;
let animationCallbacks = [];
let lastRendererUpdate = 0;
const MIN_RENDERER_UPDATE_INTERVAL = 100; // ms

// Game entities tracking
let _chessPieces = {};
let _currentTetrominoGroup = null;
let _ghostPieceGroup = null;
let _boardSize = { width: 16, height: 16 };

// Three.js objects
let _camera = null; 
let _scene = null;
let _containerElement = null;
let _renderer = null;
let _controls = null;

// For backward compatibility
let _container = null;

// Store last cell count to reduce console spam
let lastCellCount = 0;

/**
 * Set verbose logging
 * @param {boolean} enabled - Whether to enable verbose logging
 */
export function setVerboseLogging(enabled) {
	_verbose = !!enabled;
	console.log(`Verbose logging ${_verbose ? 'enabled' : 'disabled'}`);
}

/**
 * Set target FPS for frame limiting
 * @param {number} fps - Target frames per second
 */
export function setTargetFPS(fps) {
	_targetFPS = fps || 60;
	console.log(`Target FPS set to ${_targetFPS}`);
}

/**
 * Start the render loop
 * @returns {boolean} Success status
 */
export function startRenderLoop() {
	if (!_renderer || !_scene || !_camera) {
		console.warn('Cannot start render loop: renderer, scene, or camera not initialized');
		return false;
	}
	
	// Set up animation frame
	const animate = () => {
		// Request next frame
		requestAnimationFrame(animate);
		
		// Update controls if available
		if (_controls) {
			_controls.update();
		}
		
		// Render scene
		_renderer.render(_scene, _camera);
	};
	
	// Start animation
	animate();
	
	console.log('Render loop started');
	return true;
}

/**
 * Stop render loop
 */
export function stopRenderLoop() {
	if (animationFrameId !== null) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
		isRenderLoopRunning = false;
		console.log('Render loop stopped');
	}
}

/**
 * Initialize Three.js scene
 */
function initScene() {
	// Create scene
	_scene = new THREE.Scene();
	scene = _scene; // For backwards compatibility
	
	// Set background color - dark blue sky
	_scene.background = new THREE.Color(0x0a1a2a);
	
	// Create renderer
	_renderer = new THREE.WebGLRenderer({ 
		antialias: true,
		alpha: true 
	});
	_renderer.setSize(_container.clientWidth, _container.clientHeight);
	_renderer.shadowMap.enabled = true;
	_renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	
	// Add renderer to container
	_container.appendChild(_renderer.domElement);
	
	// Add window resize handler
	window.addEventListener('resize', onWindowResize);
	
	console.log('Scene initialized with dimensions:', _container.clientWidth, _container.clientHeight);
}

/**
 * Initialize camera for sky islands view
 */
function initCamera() {
	// Create camera
	_camera = new THREE.PerspectiveCamera(
		45, // Field of view - wider for better board visibility
		_container.clientWidth / _container.clientHeight, // Aspect ratio
		0.1, // Near clipping plane
		1000 // Far clipping plane
	);
	camera = _camera; // For backwards compatibility
	
	// Position camera for a better overview of the board
	_camera.position.set(8, 20, 30); // Moved further left to see more of the board
	_camera.lookAt(8, 0, 8); // Look at center of board
	
	console.log('Camera initialized at position:', _camera.position);
}

/**
 * Initialize camera controls for floating islands
 */
function initControls() {
	// Create orbit controls
	try {
		_controls = new THREE.OrbitControls(_camera, _renderer.domElement);
		_controls.enableDamping = true;
		_controls.dampingFactor = 0.15; // Smoother camera movement
		_controls.screenSpacePanning = true; // Allow panning in screen space
		
		// Allow more vertical rotation to see islands from all angles
		_controls.minPolarAngle = 0.1;  
		_controls.maxPolarAngle = Math.PI * 0.7; // Don't allow going completely under
		
		// Limit zoom to prevent getting too close or too far
		_controls.minDistance = 10;
		_controls.maxDistance = 80; // Increased max distance for better overview
		
		// Set target to center of board
		_controls.target.set(8, 0, 8);
		
		// Enable key controls for camera movement
		_controls.keys = {
			LEFT: 'ArrowLeft',
			UP: 'ArrowUp',
			RIGHT: 'ArrowRight',
			BOTTOM: 'ArrowDown'
		};
		
		// Add keyboard event listeners for camera controls
		document.addEventListener('keydown', handleCameraKeys);
		
		// Update controls after setting target
		_controls.update();
		
		console.log('Camera controls initialized successfully');
	} catch (err) {
		console.error('Error initializing camera controls:', err);
	}
}

/**
 * Initialize lighting for daytime sky
 */
function initLights() {
	// Main sunlight from a good angle for shadows and visibility
	const sunLight = new THREE.DirectionalLight(0xffffee, 1.2);
	sunLight.position.set(30, 80, 30);
	sunLight.castShadow = true;
	
	// Configure shadow properties for better quality
	sunLight.shadow.mapSize.width = 2048;
	sunLight.shadow.mapSize.height = 2048;
	
	// Set larger shadow camera to cover the islands
	sunLight.shadow.camera.left = -60;
	sunLight.shadow.camera.right = 60;
	sunLight.shadow.camera.top = 60;
	sunLight.shadow.camera.bottom = -60;
	sunLight.shadow.camera.near = 0.5;
	sunLight.shadow.camera.far = 200;
	sunLight.shadow.bias = -0.001; // Reduce shadow acne
	
	// Add sunlight to scene
	_scene.add(sunLight);
	
	// Bright ambient light for daytime sky - adjusted color for better contrast
	const ambientLight = new THREE.AmbientLight(0xd8e8ff, 0.7);
	_scene.add(ambientLight);
	
	// Add hemisphere light for better sky/ground contrast
	const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0xb3d8a5, 0.6);
	_scene.add(hemisphereLight);
	
	// Add a secondary light from the opposite side for more even lighting
	const fillLight = new THREE.DirectionalLight(0xffffcc, 0.4);
	fillLight.position.set(-20, 40, -20);
	fillLight.castShadow = false; // Secondary light doesn't need shadows
	_scene.add(fillLight);
	
	console.log('Enhanced lighting initialized for daytime sky');
}

/**
 * Initialize the game world (no board - just floating islands)
 * @param {number} width - World width bounds
 * @param {number} height - World height bounds
 */
function createBoard(width = 16, height = 16) {
	console.log(`Creating floating islands world with bounds ${width}x${height}`);
	_boardSize = { width, height };
	
	// Create board container if needed
	let worldGroup = _scene.getObjectByName('gameWorld');
	if (!worldGroup) {
		worldGroup = new THREE.Group();
		worldGroup.name = 'gameWorld';
		_scene.add(worldGroup);
	} else {
		// Clear existing board
		while (worldGroup.children.length > 0) {
			const child = worldGroup.children[0];
			worldGroup.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
	}
	
	// Create cell container
	const cellsContainer = new THREE.Group();
	cellsContainer.name = 'cells';
	worldGroup.add(cellsContainer);
	
	// Add fluffy white clouds for daytime sky
	addClouds(worldGroup, width, height);
	
	// Set background color - light blue sky
	_scene.background = new THREE.Color(0x87CEEB);
	
	// Add light fog for depth and atmosphere
	_scene.fog = new THREE.FogExp2(0x87CEEB, 0.008);
	
	console.log('Floating islands world created successfully');
}

/**
 * Add clouds to the scene for atmosphere
 * @param {THREE.Group} parent - Parent group
 * @param {number} width - World width
 * @param {number} height - World height
 */
function addClouds(parent, width, height) {
	// Create several cloud formations
	for (let i = 0; i < 12; i++) {
		// Create a cloud group
		const cloudGroup = new THREE.Group();
		
		// Random position around the play area
		const distance = 40 + Math.random() * 60;
		const angle = Math.random() * Math.PI * 2;
		
		// Position clouds in a circle around the play area
		cloudGroup.position.set(
			Math.cos(angle) * distance,
			5 + Math.random() * 15, // Higher up in the sky
			Math.sin(angle) * distance
		);
		
		// Create 3-7 cloud puffs
		const puffCount = 3 + Math.floor(Math.random() * 5);
		for (let j = 0; j < puffCount; j++) {
			// Create a cloud puff
			const puffSize = 3 + Math.random() * 6;
			const geometry = new THREE.SphereGeometry(puffSize, 8, 8);
			const material = new THREE.MeshStandardMaterial({
				color: 0xffffff,
				transparent: true,
				opacity: 0.8 + Math.random() * 0.2,
				roughness: 0.9,
				metalness: 0.1
			});
			
			const puff = new THREE.Mesh(geometry, material);
			
			// Position puff randomly within the cloud group
			puff.position.set(
				(Math.random() - 0.5) * 10,
				(Math.random() - 0.5) * 3,
				(Math.random() - 0.5) * 10
			);
			
			cloudGroup.add(puff);
		}
		
		parent.add(cloudGroup);
	}
}

/**
 * Handle window resize
 */
function onWindowResize() {
	if (!_camera || !_renderer || !_container) return;
	
	// Update camera aspect ratio
	_camera.aspect = _container.clientWidth / _container.clientHeight;
	_camera.updateProjectionMatrix();
	
	// Update renderer size
	_renderer.setSize(_container.clientWidth, _container.clientHeight);
}

/**
 * Initialize the renderer
 * @param {HTMLElement} containerElement - Container element for the renderer
 * @param {Object} options - Renderer options
 * @returns {Promise<boolean>} - Initialization success
 */
export async function init(containerElement, options = {}) {
	try {
		console.log('Initializing game renderer with options:', options);
		
		// Store options
		_options = { ..._options, ...options };
		_verbose = _options.verbose || false;
		
		// Check container element
		if (!containerElement) {
			console.error('Container element is not provided');
			return false;
		}
		
		// Store container
		_containerElement = containerElement;
		_container = containerElement; // For backwards compatibility
		
		console.log('Container dimensions:', _container.clientWidth, _container.clientHeight);
		
		// Clear any existing content
		while (_container.firstChild) {
			_container.removeChild(_container.firstChild);
		}
		
		// Initialize Three.js scene and renderer
		initScene();
		
		// Initialize camera
		initCamera();
		
		// Initialize controls
		initControls();
		
		// Initialize lights
		initLights();
		
		// Create the floating islands world
		createBoard(16, 16); // Use 16x16 as bounds for main play area
		
		// Start render loop
		startRenderLoop();
		
		// Generate some initial floating islands for visual appeal
		createInitialIslands();
		
		// Mark as initialized
		_isInitialized = true;
		console.log('Game renderer initialized successfully');
		
		return true;
	} catch (error) {
		console.error('Error initializing game renderer:', error);
		return false;
	}
}

/**
 * Create some initial floating islands for visual appeal
 */
function createInitialIslands() {
	// Generate a sample board with some cells
	const sampleBoard = Array(16).fill().map(() => Array(16).fill(0));
	
	// Create player 1 home zone (bottom)
	for (let z = 14; z <= 15; z++) {
		for (let x = 0; x < 8; x++) {
			sampleBoard[z][x] = 6; // Blue for player 1
		}
	}
	
	// Create player 2 home zone (top)
	for (let z = 0; z <= 1; z++) {
		for (let x = 8; x < 16; x++) {
			sampleBoard[z][x] = 7; // Orange for player 2
		}
	}
	
	// Create a path connecting the home zones
	for (let z = 2; z < 14; z++) {
		// Add a branching path
		if (z % 3 === 0) {
			// Branch at regular intervals
			const branchX = z < 7 ? 9 + (z % 3) : 6 - (z % 4);
			for (let x = 3; x < branchX; x++) {
				if (pseudoRandom(z * 100 + x) < 0.7) {
					sampleBoard[z][x] = 1 + Math.floor(pseudoRandom(z + x) * 5);
				}
			}
		}
		
		// Main path
		const pathWidth = 1 + Math.floor(pseudoRandom(z * 57) * 3);
		const centerX = 8 + Math.floor((pseudoRandom(z * 33) - 0.5) * 4);
		
		for (let x = centerX - pathWidth; x <= centerX + pathWidth; x++) {
			if (x >= 0 && x < 16 && pseudoRandom(z * 42 + x * 13) < 0.85) {
				sampleBoard[z][x] = 1 + Math.floor(pseudoRandom(z * x) * 5);
			}
		}
	}
	
	// Add sample chess pieces
	const pieces = [
		{ id: 'p1-pawn-1', type: 'pawn', player: 1, x: 3, z: 15 },
		{ id: 'p1-knight-1', type: 'knight', player: 1, x: 5, z: 14 },
		{ id: 'p1-king-1', type: 'king', player: 1, x: 4, z: 15 },
		{ id: 'p2-pawn-1', type: 'pawn', player: 2, x: 12, z: 0 },
		{ id: 'p2-rook-1', type: 'rook', player: 2, x: 10, z: 1 },
		{ id: 'p2-king-1', type: 'king', player: 2, x: 11, z: 0 }
	];
	
	// Visualize the sample board
	updateBoardVisualization(sampleBoard);
	
	// Add the chess pieces
	pieces.forEach(piece => createChessPiece(piece));
}

/**
 * Add sample chess pieces for testing visibility
 */
function addSamplePieces() {
	const pieces = [
		{ id: 'test-pawn', type: 'pawn', player: 1, x: 3, z: 3 },
		{ id: 'test-rook', type: 'rook', player: 2, x: 12, z: 12 }
	];
	
	console.log('Adding sample pieces for testing');
	pieces.forEach(piece => createChessPiece(piece));
}

/**
 * Set up 3D scene
 * @param {HTMLElement} container - Container element
 * @returns {boolean} Whether setup was successful
 */
export function setup3DScene(container) {
	try {
		console.log('Setting up 3D scene');
		
		// Check if THREE.js is available
		if (typeof THREE === 'undefined') {
			console.error('THREE.js is not available');
			return false;
		}
		
		// Create scene
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x0A1A2A); // Dark blue sky
		
		// Add fog for depth
		scene.fog = new THREE.FogExp2(0x0A1A2A, 0.03);
		
		// Create camera
		camera = new THREE.PerspectiveCamera(
			70,                                     // Field of view
			window.innerWidth / window.innerHeight, // Aspect ratio
			0.1,                                    // Near clipping plane
			1000                                    // Far clipping plane
		);
		
		// Position camera to see the whole board
		camera.position.set(15, 20, 30);
		camera.lookAt(0, 0, 0);
		
		// Create renderer
		renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.setClearColor(0x0A1A2A); // Same as scene.background
		
		// Setup resize handler
		window.addEventListener('resize', onWindowResize);
		
		// Initialize orbit controls if available
		try {
			if (typeof THREE.OrbitControls !== 'undefined') {
				controls = new THREE.OrbitControls(camera, renderer.domElement);
				controls.enableDamping = true;
				
				controls.dampingFactor = 0.25;
				controls.screenSpacePanning = false;
				controls.maxPolarAngle = Math.PI / 2;
				controls.minDistance = 5;
				controls.maxDistance = 50;
				
				// Set initial position and target
				controls.target.set(8, 0, 8);
				camera.position.set(15, 20, 30);
				camera.lookAt(controls.target);
				controls.update();
				
				// Add reset button
				addCameraResetButton(container);
				
				// Add on-screen instructions for camera control
				addCameraInstructions(container);
			} else {
				console.warn('THREE.OrbitControls not available, falling back to basic controls');
				setupBasicCameraControls(container);
			}
		} catch (error) {
			console.warn('Error setting up OrbitControls, falling back to basic controls:', error);
			setupBasicCameraControls(container);
		}
		
		// Setup lights
		setupLights();
		
		// Add debug grid
		const gridHelper = new THREE.GridHelper(32, 32, 0x555555, 0x555555);
		gridHelper.position.y = -0.01;
		gridHelper.visible = false; // Hide grid for floating islands look
		scene.add(gridHelper);
		gridHelperObj = gridHelper;
		
		console.log('3D scene setup complete');
		return true;
	} catch (error) {
		console.error('Error setting up 3D scene:', error);
		return false;
	}
}

/**
 * Set up lights
 */
export function setupLights() {
	try {
		// Add ambient light
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
		scene.add(ambientLight);
		
		// Add directional light
		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
		directionalLight.position.set(50, 100, 50);
		directionalLight.castShadow = true;
		
		// Set up shadow properties
		directionalLight.shadow.mapSize.width = 2048;
		directionalLight.shadow.mapSize.height = 2048;
		directionalLight.shadow.camera.left = -50;
		directionalLight.shadow.camera.right = 50;
		directionalLight.shadow.camera.top = 50;
		directionalLight.shadow.camera.bottom = -50;
		
		scene.add(directionalLight);
		
		// Add hemisphere light
		const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
		scene.add(hemisphereLight);
		
		return true;
	} catch (error) {
		console.error('Error setting up lights:', error);
		return false;
	}
}

/**
 * Set up basic camera controls without OrbitControls
 */
export function setupBasicCameraControls(container) {
	try {
		// Set initial camera position
		if (camera) {
			camera.position.set(15, 15, 15);
			camera.lookAt(0, 0, 0);
		}
		
		// Add keyboard controls for camera
		document.addEventListener('keydown', event => {
			if (!camera) return;
			
			const moveSpeed = 1;
			
			switch (event.key) {
				case 'ArrowUp':
					camera.position.z -= moveSpeed;
					break;
				case 'ArrowDown':
					camera.position.z += moveSpeed;
					break;
				case 'ArrowLeft':
					camera.position.x -= moveSpeed;
					break;
				case 'ArrowRight':
					camera.position.x += moveSpeed;
					break;
				case 'PageUp':
					camera.position.y += moveSpeed;
					break;
				case 'PageDown':
					camera.position.y -= moveSpeed;
					break;
				case 'r':
				case 'R':
					// Reset camera position
					camera.position.set(15, 15, 15);
					camera.lookAt(0, 0, 0);
					break;
			}
		});
		
		// Add button to reset camera
		addCameraResetButton(container);
		
		return true;
	} catch (error) {
		console.error('Error setting up basic camera controls:', error);
		return false;
	}
}

/**
 * Add camera reset button to the container
 */
export function addCameraResetButton(container) {
	try {
		if (!container) {
			console.warn('Cannot add camera reset button: container not provided');
			return;
		}
		
		// Check if button already exists
		let resetButton = document.getElementById('reset-camera-button');
		if (resetButton) {
			// Button already exists, skip creation
			return;
		}
		
		// Create reset button
		resetButton = document.createElement('button');
		resetButton.id = 'reset-camera-button';
		resetButton.textContent = 'Reset Camera';
		resetButton.style.position = 'absolute';
		resetButton.style.bottom = '10px';
		resetButton.style.right = '10px';
		resetButton.style.padding = '8px 16px';
		resetButton.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		resetButton.style.color = 'white';
		resetButton.style.border = '1px solid rgba(255, 255, 255, 0.3)';
		resetButton.style.borderRadius = '4px';
		resetButton.style.cursor = 'pointer';
		resetButton.style.zIndex = '1000';
		
		// Add click handler
		resetButton.addEventListener('click', () => {
			if (camera) {
				// Reset camera position
				camera.position.set(15, 20, 30);
				camera.lookAt(0, 0, 0);
				
				// Reset orbit controls if available
				if (controls) {
					controls.target.set(0, 0, 0);
					controls.update();
				}
				
				console.log('Camera position reset');
			}
		});
		
		// Append to container
		container.appendChild(resetButton);
	} catch (error) {
		console.warn('Error adding camera reset button:', error);
	}
}

/**
 * Add on-screen instructions for camera controls
 */
function addCameraInstructions(container) {
	try {
		if (!container) {
			console.warn('Cannot add camera instructions: container not provided');
			return;
		}
		
		// Check if instructions already exist
		let instructions = document.getElementById('camera-instructions');
		if (instructions) {
			// Instructions already exist, skip creation
			return;
		}
		
		instructions = document.createElement('div');
		instructions.id = 'camera-instructions';
		instructions.style.position = 'absolute';
		instructions.style.bottom = '10px';
		instructions.style.left = '10px';
		instructions.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		instructions.style.color = 'white';
		instructions.style.padding = '10px';
		instructions.style.borderRadius = '5px';
		instructions.style.fontSize = '12px';
		instructions.style.fontFamily = 'monospace';
		instructions.style.pointerEvents = 'none'; // Don't block mouse events
		instructions.style.zIndex = '1000';
		instructions.innerHTML = `
			<strong>Camera Controls:</strong><br>
			Left Mouse: Rotate<br>
			Right Mouse: Pan<br>
			Scroll: Zoom<br>
			R: Reset Camera<br>
		`;
		
		container.appendChild(instructions);
	} catch (error) {
		console.warn('Error adding camera instructions:', error);
	}
}

/**
 * Render function
 * @param {number} time - Current timestamp
 */
export function render(time) {
	if (!_isInitialized) return;
	
	if (is3DMode) {
		if (renderer && scene && camera) {
			// Update controls if available
			if (controls && typeof controls.update === 'function') {
				controls.update();
			}
			
			// Render the scene
			renderer.render(scene, camera);
		}
	} else if (context && canvas) {
		// Clear canvas
		context.clearRect(0, 0, canvas.width, canvas.height);
		// Draw background
		context.fillStyle = '#121212';
		context.fillRect(0, 0, canvas.width, canvas.height);
		
		// Basic 2D renderer - show text indicating it's working
		context.fillStyle = '#ffffff';
		context.font = '14px Arial';
		context.fillText('2D Renderer Active', 10, 20);
	}
}

/**
 * Update debug info panel
 */
function updateDebugInfo() {
	try {
		// Create or get debug panel
		let debugPanel = document.getElementById('game-renderer-debug');
		if (!debugPanel) {
			debugPanel = document.createElement('div');
			debugPanel.id = 'game-renderer-debug';
			debugPanel.style.position = 'absolute';
			debugPanel.style.top = '10px';
			debugPanel.style.left = '10px';
			debugPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
			debugPanel.style.color = 'white';
			debugPanel.style.padding = '10px';
			debugPanel.style.borderRadius = '5px';
			debugPanel.style.fontFamily = 'monospace';
			debugPanel.style.fontSize = '12px';
			debugPanel.style.zIndex = '1000';
			document.body.appendChild(debugPanel);
		}
		
		// Update debug info
		let info = '<strong>Renderer Debug</strong><br>';
		info += `Mode: ${is3DMode ? '3D' : '2D'}<br>`;
		info += `Initialized: ${_isInitialized ? 'Yes' : 'No'}<br>`;
		info += `FPS: ${currentFps}<br>`;
		
		if (camera) {
			info += '<br><strong>Camera</strong><br>';
			info += `X: ${camera.position.x.toFixed(2)}<br>`;
			info += `Y: ${camera.position.y.toFixed(2)}<br>`;
			info += `Z: ${camera.position.z.toFixed(2)}<br>`;
		}
		
		debugPanel.innerHTML = info;
	} catch (error) {
		console.error('Error updating debug info:', error);
	}
}

/**
 * Set game state
 * @param {Object} gameState - Game state object
 */
export function setGameState(gameState) {
	try {
		// Skip update if state is null
		if (!gameState) {
			return;
		}
		
		// Store the state
		currentGameState = gameState;
		
		// Update board visualization
		if (gameState.board) {
			updateBoardVisualization(gameState.board);
		}
		
	} catch (error) {
		console.error('Error setting game state:', error);
	}
}

/**
 * Get current game state
 * @returns {Object} Current game state
 */
export function getGameState() {
	return currentGameState;
}

/**
 * Check if the renderer is initialized
 * @returns {boolean} - Whether the renderer is initialized
 */
export function isInitialized() {
	return _isInitialized;
}

/**
 * Update animations
 * @param {number} timestamp - Current timestamp
 * @param {number} deltaTime - Time since last frame
 */
function updateAnimations(timestamp, deltaTime) {
	// Process animation callbacks
	if (animationCallbacks && animationCallbacks.length > 0) {
		// Process each callback
		for (let i = animationCallbacks.length - 1; i >= 0; i--) {
			try {
				if (typeof animationCallbacks[i] === 'function') {
					animationCallbacks[i](timestamp, deltaTime);
				} else {
					// Remove invalid callbacks
					animationCallbacks.splice(i, 1);
				}
			} catch (error) {
				console.error('Error in animation callback:', error);
				// Remove callback that caused an error
				animationCallbacks.splice(i, 1);
			}
		}
	}
}

/**
 * Convert screen coordinates to board coordinates
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate
 * @returns {Object|null} Board coordinates or null if no intersection
 */
export function screenToBoardCoordinates(screenX, screenY) {
	try {
		// Check if we have the required objects
		if (!_camera || !_scene) {
			console.warn('Camera or scene not initialized for screen to board coordinates');
			return null;
		}
		
		// Normalized device coordinates
		const rect = _containerElement.getBoundingClientRect();
		const x = ((screenX - rect.left) / rect.width) * 2 - 1;
		const y = -((screenY - rect.top) / rect.height) * 2 + 1;
		
		// Create raycaster
		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera({ x, y }, _camera);
		
		// Define a plane at y=0 to represent the board
		const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
		
		// Get intersection point with board plane
		const intersectionPoint = new THREE.Vector3();
		const intersects = raycaster.ray.intersectPlane(boardPlane, intersectionPoint);
		
		if (!intersects) {
			return null;
		}
		
		// Convert to board coordinates
		const boardX = Math.floor(intersectionPoint.x + _boardSize.width / 2);
		const boardZ = Math.floor(intersectionPoint.z + _boardSize.height / 2);
		
		// Check if within board bounds
		if (boardX < 0 || boardX >= _boardSize.width || boardZ < 0 || boardZ >= _boardSize.height) {
			return null;
		}
		
		return { x: boardX, y: 0, z: boardZ };
	} catch (error) {
		console.error('Error in screenToBoardCoordinates:', error);
		return null;
	}
}

/**
 * Update game entities based on current game state
 * @param {Object} gameState - Current game state
 */
export function updateGameEntities(gameState) {
	if (!gameState) {
		console.warn('No game state provided to updateGameEntities');
		return;
	}
	
	console.log('Updating game entities with state:', 
		gameState.chessPieces ? `${gameState.chessPieces.length} chess pieces` : 'no chess pieces', 
		gameState.currentTetromino ? 'has tetromino' : 'no tetromino',
		gameState.board ? `board: ${gameState.board.length}x${gameState.board[0]?.length}` : 'no board'
	);
	
	// Use the available scene
	const currentScene = _scene || scene;
	if (!currentScene) {
		console.error('No scene available for updating game entities');
		return;
	}
	
	try {
		// Update board visualization first
		if (gameState.board) {
			updateBoardVisualization(gameState.board);
		}
		
		// Clear existing entities
		clearGameEntities();
		
		// Update current tetromino
		if (gameState.currentTetromino) {
			updateCurrentTetromino(gameState.currentTetromino);
		}
		
		// Update ghost piece
		if (gameState.ghostPiece) {
			updateGhostPiece(gameState.ghostPiece, gameState.currentTetromino);
		}
		
		// Update chess pieces
		if (gameState.chessPieces && gameState.chessPieces.length > 0) {
			updateChessPieces(gameState.chessPieces);
		}
	} catch (error) {
		console.error('Error updating game entities:', error);
	}
}

/**
 * Clear all game entities 
 */
function clearGameEntities() {
	// Use the available scene
	const currentScene = _scene || scene;
	
	// Remove current tetromino
	if (_currentTetrominoGroup) {
		currentScene.remove(_currentTetrominoGroup);
		_currentTetrominoGroup = null;
	}
	
	// Remove ghost piece
	if (_ghostPieceGroup) {
		currentScene.remove(_ghostPieceGroup);
		_ghostPieceGroup = null;
	}
	
	// Remove all chess pieces
	for (const pieceId in _chessPieces) {
		if (_chessPieces[pieceId]) {
			currentScene.remove(_chessPieces[pieceId]);
		}
	}
	_chessPieces = {};
}

/**
 * Update the current tetromino visualization
 * @param {Object} tetromino - Tetromino data
 */
function updateCurrentTetromino(tetromino) {
	if (!tetromino || !tetromino.shape || !tetromino.position) return;
	
	// Use the available scene
	const currentScene = _scene || scene;
	
	// Create a new group for the tetromino
	_currentTetrominoGroup = new THREE.Group();
	
	// Set tetromino position
	_currentTetrominoGroup.position.set(
		tetromino.position.x - (_boardSize.width / 2) + 0.5,
		tetromino.position.y + 0.5,
		tetromino.position.z - (_boardSize.height / 2) + 0.5
	);
	
	// Get tetromino color
	const tetrominoColor = getTetrominoColor(tetromino.type);
	
	// Create tetromino blocks with enhanced visuals
	for (let y = 0; y < tetromino.shape.length; y++) {
		for (let x = 0; x < tetromino.shape[y].length; x++) {
			// Skip empty cells
			if (!tetromino.shape[y][x]) continue;
			
			// Create the block group
			const blockGroup = new THREE.Group();
			
			// Create main block
			const mainBlock = createBlock(tetrominoColor);
			mainBlock.position.y = 0;
			blockGroup.add(mainBlock);
			
			// Add subtle glow effect
			const glowSphere = new THREE.Mesh(
				new THREE.SphereGeometry(0.55, 8, 8),
				new THREE.MeshBasicMaterial({
					color: tetrominoColor,
					transparent: true,
					opacity: 0.15,
					blending: THREE.AdditiveBlending
				})
			);
			blockGroup.add(glowSphere);
			
			// Add particle effects to tetromino
			if (Math.random() < 0.3) {
				const particleSystem = createParticleSystem(tetrominoColor);
				blockGroup.add(particleSystem);
			}
			
			// Position the block
			blockGroup.position.set(x, 0, y);
			
			// Add to tetromino group
			_currentTetrominoGroup.add(blockGroup);
		}
	}
	
	// Add floating animation
	addFloatingAnimation(_currentTetrominoGroup);
	
	// Add to scene
	currentScene.add(_currentTetrominoGroup);
}

/**
 * Create a simple particle system
 * @param {number} color - Base color
 * @returns {THREE.Points} - Particle system
 */
function createParticleSystem(color) {
	// Create vertices for particles
	const particleCount = 5 + Math.floor(Math.random() * 5);
	const vertices = [];
	
	for (let i = 0; i < particleCount; i++) {
		// Random position within block
		const x = (Math.random() - 0.5) * 0.6;
		const y = (Math.random() - 0.5) * 0.6;
		const z = (Math.random() - 0.5) * 0.6;
		
		vertices.push(x, y, z);
	}
	
	// Create geometry and material
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
	
	const material = new THREE.PointsMaterial({
		color: color,
		size: 0.05 + Math.random() * 0.05,
		transparent: true,
		opacity: 0.7,
		blending: THREE.AdditiveBlending
	});
	
	// Create particle system
	return new THREE.Points(geometry, material);
}

/**
 * Create a block mesh with enhanced visuals
 * @param {number} color - Block color
 * @param {number} opacity - Block opacity (0-1)
 * @returns {THREE.Mesh} - Block mesh
 */
function createBlock(color, opacity = 1.0) {
	// Create block group
	const blockGroup = new THREE.Group();
	
	// Create geometry for main block
	const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);
	
	// Create material
	const material = new THREE.MeshStandardMaterial({ 
		color: color,
		transparent: opacity < 1.0,
		opacity: opacity,
		roughness: 0.5,
		metalness: 0.3
	});
	
	// Create mesh
	const mesh = new THREE.Mesh(geometry, material);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	
	// Add subtle bevel edges
	const bevelSize = 0.05;
	const bevelSegments = 2;
	
	// Create beveled edges using additional smaller boxes
	for (let i = 0; i < 12; i++) {
		const edgeGeometry = new THREE.BoxGeometry(
			i < 4 ? 1.0 - bevelSize * 2 : (i < 8 ? bevelSize : 1.0 - bevelSize * 2),
			i < 4 ? bevelSize : (i < 8 ? 1.0 - bevelSize * 2 : bevelSize),
			i < 4 ? bevelSize : (i < 8 ? bevelSize : 1.0 - bevelSize * 2)
		);
		
		const edgeMaterial = new THREE.MeshStandardMaterial({
			color: darkenColor(color, 0.9),
			roughness: 0.6,
			metalness: 0.2
		});
		
		const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
		
		// Position the edge
		switch (i) {
			case 0: edge.position.set(0, -0.5 + bevelSize/2, -0.5 + bevelSize/2); break;
			case 1: edge.position.set(0, -0.5 + bevelSize/2, 0.5 - bevelSize/2); break;
			case 2: edge.position.set(0, 0.5 - bevelSize/2, -0.5 + bevelSize/2); break;
			case 3: edge.position.set(0, 0.5 - bevelSize/2, 0.5 - bevelSize/2); break;
			case 4: edge.position.set(-0.5 + bevelSize/2, 0, -0.5 + bevelSize/2); break;
			case 5: edge.position.set(-0.5 + bevelSize/2, 0, 0.5 - bevelSize/2); break;
			case 6: edge.position.set(0.5 - bevelSize/2, 0, -0.5 + bevelSize/2); break;
			case 7: edge.position.set(0.5 - bevelSize/2, 0, 0.5 - bevelSize/2); break;
			case 8: edge.position.set(-0.5 + bevelSize/2, -0.5 + bevelSize/2, 0); break;
			case 9: edge.position.set(-0.5 + bevelSize/2, 0.5 - bevelSize/2, 0); break;
			case 10: edge.position.set(0.5 - bevelSize/2, -0.5 + bevelSize/2, 0); break;
			case 11: edge.position.set(0.5 - bevelSize/2, 0.5 - bevelSize/2, 0); break;
		}
		
		edge.castShadow = true;
		edge.receiveShadow = true;
		mesh.add(edge);
	}
	
	return mesh;
}

/**
 * Update the ghost piece visualization
 * @param {Object} ghostPiece - Ghost piece data
 * @param {Object} tetromino - Current tetromino data for shape
 */
function updateGhostPiece(ghostPiece, tetromino) {
	if (!ghostPiece || !ghostPiece.position || !tetromino || !tetromino.shape) return;
	
	// Use the available scene
	const currentScene = _scene || scene;
	
	// Create a new group for the ghost piece
	_ghostPieceGroup = new THREE.Group();
	
	// Set ghost piece position
	_ghostPieceGroup.position.set(
		tetromino.position.x - (_boardSize.width / 2) + 0.5,
		ghostPiece.position.y + 0.5,
		tetromino.position.z - (_boardSize.height / 2) + 0.5
	);
	
	// Create ghost blocks
	for (let y = 0; y < tetromino.shape.length; y++) {
		for (let x = 0; x < tetromino.shape[y].length; x++) {
			// Skip empty cells
			if (!tetromino.shape[y][x]) continue;
			
			// Create a transparent ghost block
			const block = createBlock(0xffffff, 0.3);
			
			// Position the block
			block.position.set(x, 0, y);
			
			// Add to ghost group
			_ghostPieceGroup.add(block);
		}
	}
	
	// Add to scene
	currentScene.add(_ghostPieceGroup);
}

/**
 * Update chess pieces visualization
 * @param {Array} chessPieces - Array of chess pieces
 */
function updateChessPieces(chessPieces) {
	if (!chessPieces || !chessPieces.length) return;
	
	// Use the available scene
	const currentScene = _scene || scene;
	
	// Track existing pieces to remove any that no longer exist
	const existingPieces = new Set(Object.keys(_chessPieces));
	
	// Update or create each chess piece
	for (const piece of chessPieces) {
		if (!piece.id || !piece.type || piece.x === undefined || piece.z === undefined) {
			continue;
		}
		
		// Mark as processed
		existingPieces.delete(piece.id);
		
		// Check if piece already exists
		if (_chessPieces[piece.id]) {
			// Update position while keeping floating animation
			const pieceObj = _chessPieces[piece.id];
			// Store initial height offset from the sine wave animation
			const currentHeightOffset = pieceObj.position.y - 1.0;
			
			pieceObj.position.set(
				piece.x - (_boardSize.width / 2) + 0.5,
				1.0 + currentHeightOffset, // Preserve current height in animation
				piece.z - (_boardSize.height / 2) + 0.5
			);
			
			// Update user data
			pieceObj.userData.x = piece.x;
			pieceObj.userData.z = piece.z;
		} else {
			// Create new piece
			createChessPiece(piece);
		}
	}
	
	// Remove pieces that no longer exist
	for (const pieceId of existingPieces) {
		if (_chessPieces[pieceId]) {
			currentScene.remove(_chessPieces[pieceId]);
			delete _chessPieces[pieceId];
		}
	}
}

/**
 * Create a chess piece 3D object
 * @param {Object} piece - Chess piece data
 */
function createChessPiece(piece) {
	if (!piece.id || !piece.type || piece.x === undefined || piece.z === undefined) {
		return;
	}
	
	// Use the available scene
	const currentScene = _scene || scene;
	
	// Get player color
	const playerColor = getPlayerColor(piece.player);
	
	// Create a piece group
	const pieceGroup = new THREE.Group();
	pieceGroup.name = piece.id;
	
	// Create more detailed chess pieces based on type
	switch (piece.type.toLowerCase()) {
		case 'pawn':
			// Pawn body
			const pawnBody = new THREE.Mesh(
				new THREE.ConeGeometry(0.25, 0.6, 8),
				new THREE.MeshStandardMaterial({ 
					color: playerColor,
					roughness: 0.6,
					metalness: 0.3
				})
			);
			pawnBody.position.y = 0.4;
			pieceGroup.add(pawnBody);
			
			// Pawn base
			const pawnBase = new THREE.Mesh(
				new THREE.CylinderGeometry(0.2, 0.25, 0.2, 8),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.7),
					roughness: 0.7,
					metalness: 0.2
				})
			);
			pawnBase.position.y = 0.1;
			pieceGroup.add(pawnBase);
			break;
			
		case 'rook':
			// Rook body
			const rookBody = new THREE.Mesh(
				new THREE.BoxGeometry(0.35, 0.6, 0.35),
				new THREE.MeshStandardMaterial({ 
					color: playerColor,
					roughness: 0.5,
					metalness: 0.3
				})
			);
			rookBody.position.y = 0.4;
			pieceGroup.add(rookBody);
			
			// Rook top
			const rookTop = new THREE.Mesh(
				new THREE.BoxGeometry(0.45, 0.15, 0.45),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.8),
					roughness: 0.6,
					metalness: 0.3
				})
			);
			rookTop.position.y = 0.8;
			pieceGroup.add(rookTop);
			
			// Rook base
			const rookBase = new THREE.Mesh(
				new THREE.CylinderGeometry(0.25, 0.3, 0.2, 8),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.7),
					roughness: 0.7,
					metalness: 0.2
				})
			);
			rookBase.position.y = 0.1;
			pieceGroup.add(rookBase);
			break;
			
		case 'knight':
			// Knight head
			const knightHead = new THREE.Mesh(
				new THREE.SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6),
				new THREE.MeshStandardMaterial({ 
					color: playerColor,
					roughness: 0.5,
					metalness: 0.3
				})
			);
			knightHead.rotation.x = Math.PI * 0.2;
			knightHead.position.set(0.1, 0.7, 0);
			pieceGroup.add(knightHead);
			
			// Knight body
			const knightBody = new THREE.Mesh(
				new THREE.CylinderGeometry(0.2, 0.25, 0.5, 8),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.9),
					roughness: 0.6,
					metalness: 0.3
				})
			);
			knightBody.position.y = 0.3;
			pieceGroup.add(knightBody);
			
			// Knight base
			const knightBase = new THREE.Mesh(
				new THREE.CylinderGeometry(0.25, 0.3, 0.2, 8),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.7),
					roughness: 0.7,
					metalness: 0.2
				})
			);
			knightBase.position.y = 0.1;
			pieceGroup.add(knightBase);
			break;
			
		case 'bishop':
			// Bishop body
			const bishopBody = new THREE.Mesh(
				new THREE.ConeGeometry(0.25, 0.7, 8),
				new THREE.MeshStandardMaterial({ 
					color: playerColor,
					roughness: 0.5,
					metalness: 0.3
				})
			);
			bishopBody.position.y = 0.4;
			pieceGroup.add(bishopBody);
			
			// Bishop top
			const bishopTop = new THREE.Mesh(
				new THREE.SphereGeometry(0.1, 8, 8),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.8),
					roughness: 0.5,
					metalness: 0.4
				})
			);
			bishopTop.position.y = 0.85;
			pieceGroup.add(bishopTop);
			
			// Bishop base
			const bishopBase = new THREE.Mesh(
				new THREE.CylinderGeometry(0.25, 0.3, 0.2, 8),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.7),
					roughness: 0.7,
					metalness: 0.2
				})
			);
			bishopBase.position.y = 0.1;
			pieceGroup.add(bishopBase);
			break;
			
		case 'queen':
			// Queen body
			const queenBody = new THREE.Mesh(
				new THREE.CylinderGeometry(0.25, 0.3, 0.7, 8),
				new THREE.MeshStandardMaterial({ 
					color: playerColor,
					roughness: 0.4,
					metalness: 0.5
				})
			);
			queenBody.position.y = 0.4;
			pieceGroup.add(queenBody);
			
			// Queen crown
			const queenCrown = new THREE.Mesh(
				new THREE.SphereGeometry(0.2, 8, 8),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.9),
					roughness: 0.4,
					metalness: 0.6
				})
			);
			queenCrown.position.y = 0.85;
			pieceGroup.add(queenCrown);
			
			// Queen base
			const queenBase = new THREE.Mesh(
				new THREE.CylinderGeometry(0.3, 0.35, 0.2, 8),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.7),
					roughness: 0.7,
					metalness: 0.3
				})
			);
			queenBase.position.y = 0.1;
			pieceGroup.add(queenBase);
			break;
			
		case 'king':
			// King body
			const kingBody = new THREE.Mesh(
				new THREE.CylinderGeometry(0.25, 0.3, 0.7, 8),
				new THREE.MeshStandardMaterial({ 
					color: playerColor,
					roughness: 0.4,
					metalness: 0.5
				})
			);
			kingBody.position.y = 0.4;
			pieceGroup.add(kingBody);
			
			// King crown
			const kingCrown = new THREE.Mesh(
				new THREE.CylinderGeometry(0.2, 0.25, 0.2, 8),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.9),
					roughness: 0.4,
					metalness: 0.6
				})
			);
			kingCrown.position.y = 0.85;
			pieceGroup.add(kingCrown);
			
			// King cross
			const kingCrossV = new THREE.Mesh(
				new THREE.BoxGeometry(0.06, 0.2, 0.06),
				new THREE.MeshStandardMaterial({ 
					color: playerColor,
					roughness: 0.3,
					metalness: 0.7
				})
			);
			kingCrossV.position.y = 1.0;
			pieceGroup.add(kingCrossV);
			
			const kingCrossH = new THREE.Mesh(
				new THREE.BoxGeometry(0.15, 0.06, 0.06),
				new THREE.MeshStandardMaterial({ 
					color: playerColor,
					roughness: 0.3,
					metalness: 0.7
				})
			);
			kingCrossH.position.y = 0.95;
			pieceGroup.add(kingCrossH);
			
			// King base
			const kingBase = new THREE.Mesh(
				new THREE.CylinderGeometry(0.3, 0.35, 0.2, 8),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.7),
					roughness: 0.7,
					metalness: 0.3
				})
			);
			kingBase.position.y = 0.1;
			pieceGroup.add(kingBase);
			break;
			
		default:
			// Generic piece for unknown types
			const genericBody = new THREE.Mesh(
				new THREE.BoxGeometry(0.3, 0.6, 0.3),
				new THREE.MeshStandardMaterial({ 
					color: playerColor,
					roughness: 0.5,
					metalness: 0.3
				})
			);
			genericBody.position.y = 0.3;
			pieceGroup.add(genericBody);
			
			const genericBase = new THREE.Mesh(
				new THREE.CylinderGeometry(0.25, 0.3, 0.2, 8),
				new THREE.MeshStandardMaterial({ 
					color: darkenColor(playerColor, 0.7),
					roughness: 0.7,
					metalness: 0.2
				})
			);
			genericBase.position.y = 0.1;
			pieceGroup.add(genericBase);
	}
	
	// Enable shadows for all pieces
	pieceGroup.traverse(object => {
		if (object instanceof THREE.Mesh) {
			object.castShadow = true;
			object.receiveShadow = true;
		}
	});
	
	// Set position in the world - directly on the cell
	pieceGroup.position.set(
		piece.x - (_boardSize.width / 2) + 0.5,
		1.0, // Position on top of the cell (cell is at y=0.5 with height 1.0)
		piece.z - (_boardSize.height / 2) + 0.5
	);
	
	// Add piece data to user data for hover/selection
	pieceGroup.userData = {
		id: piece.id,
		type: piece.type,
		player: piece.player,
		x: piece.x,
		z: piece.z
	};
	
	// Add subtle floating animation - with consistent behavior based on piece ID
	const pieceSeed = piece.id.charCodeAt(0) + piece.id.charCodeAt(piece.id.length - 1);
	const floatSpeed = 0.0004 + pseudoRandom(pieceSeed) * 0.0002;
	const floatHeight = 0.05 + pseudoRandom(pieceSeed + 1) * 0.05;
	const startOffset = pseudoRandom(pieceSeed + 2) * Math.PI * 2;
	
	const initialY = pieceGroup.position.y;
	
	// Add to animation callbacks for floating effect
	if (animationCallbacks) {
		animationCallbacks.push((timestamp) => {
			pieceGroup.position.y = initialY + Math.sin(timestamp * floatSpeed + startOffset) * floatHeight;
		});
	}
	
	// Store chess piece reference
	_chessPieces[piece.id] = pieceGroup;
	
	// Add to scene
	currentScene.add(pieceGroup);
}

/**
 * Add floating animation to an object
 * @param {THREE.Object3D} object - Object to animate
 */
function addFloatingAnimation(object) {
	// Generate random parameters for unique floating motion
	const floatSpeed = 0.0005 + Math.random() * 0.0005;
	const floatHeight = 0.15 + Math.random() * 0.1;
	const rotationSpeed = (Math.random() - 0.5) * 0.0002;
	const startOffset = Math.random() * Math.PI * 2;
	
	// Store initial position
	const initialY = object.position.y;
	
	// Add to animation callbacks
	animationCallbacks.push((timestamp) => {
		// Floating motion
		object.position.y = initialY + Math.sin(timestamp * floatSpeed + startOffset) * floatHeight;
		
		// Subtle rotation
		object.rotation.y += rotationSpeed;
	});
}

/**
 * Get color for tetromino type
 * @param {string} type - Tetromino type
 * @returns {number} - Color hex value
 */
function getTetrominoColor(type) {
	const colors = {
		'I': 0x00ffff, // Cyan
		'O': 0xffff00, // Yellow
		'T': 0x800080, // Purple
		'S': 0x00ff00, // Green
		'Z': 0xff0000, // Red
		'J': 0x0000ff, // Blue
		'L': 0xff8800  // Orange
	};
	
	return colors[type] || 0xcccccc;
}

/**
 * Get color for player
 * @param {number} playerId - Player ID
 * @returns {number} - Color hex value
 */
function getPlayerColor(playerId) {
	const colors = [
		0xffffff, // White (neutral)
		0x0077ff, // Player 1 - Blue
		0xff4400, // Player 2 - Red
		0x00dd00, // Player 3 - Green
		0xeeee00, // Player 4 - Yellow
		0xcc00cc, // Player 5 - Purple
		0x00cccc, // Player 6 - Cyan
		0xff00ff, // Player 7 - Magenta
		0xffaa00  // Player 8 - Orange
	];
	
	return colors[playerId] || 0xcccccc;
}

/**
 * Create the game board with the specified dimensions
 * @param {number} width - Board width
 * @param {number} height - Board height 
 * @returns {boolean} Success status
 */
export function createGameBoard(width = 16, height = 16) {
	try {
		// Use the available scene
		const currentScene = _scene || scene;
		if (!currentScene) {
			console.warn('Cannot create game board: scene not initialized');
			return false;
		}
		
		// Create board
		createBoard(width, height);
		
		console.log(`Game board created with dimensions ${width}x${height}`);
		return true;
	} catch (error) {
		console.error('Error creating game board:', error);
		return false;
	}
}

/**
 * Update the world visualization based on the game state
 * @param {Array<Array<number>>} board - 2D array representing the active cells
 * @returns {boolean} Success status
 */
export function updateBoardVisualization(board) {
	try {
		// Use the available scene
		const currentScene = _scene || scene;
		if (!currentScene || !board) {
			return false;
		}
		
		// Get world group
		const worldGroup = currentScene.getObjectByName('gameWorld');
		if (!worldGroup) {
			// Only log once
			console.warn("World group not found, creating board first");
			createBoard(_boardSize.width, _boardSize.height);
			return updateBoardVisualization(board); // Try again after creating
		}
		
		// Get cells container
		let cellsContainer = worldGroup.getObjectByName('cells');
		if (!cellsContainer) {
			cellsContainer = new THREE.Group();
			cellsContainer.name = 'cells';
			worldGroup.add(cellsContainer);
		}
		
		// Store existing cells to avoid recreating unnecessarily 
		const existingCells = new Map();
		
		// Store all current cells for possible reuse
		cellsContainer.children.forEach(child => {
			if (child.userData && child.userData.cellKey) {
				existingCells.set(child.userData.cellKey, child);
			}
		});
		
		// Clear existing cells container but don't delete objects yet
		while (cellsContainer.children.length > 0) {
			cellsContainer.remove(cellsContainer.children[0]);
		}
		
		// Set to track cells that are used in this update
		const usedCells = new Set();
		
		// Create cells based on board data - organized grid with floating effect
		for (let z = 0; z < board.length; z++) {
			for (let x = 0; x < board[z].length; x++) {
				const cellValue = board[z][x];
				
				// Skip empty cells
				if (!cellValue) continue;
				
				// Create cell key for reuse tracking
				const cellKey = `${x},${z},${cellValue}`;
				usedCells.add(cellKey);
				
				// Reuse existing cell if available
				let cellGroup;
				if (existingCells.has(cellKey)) {
					cellGroup = existingCells.get(cellKey);
				} else {
					// Create new island cell group
					cellGroup = createCellGroup(x, z, cellValue);
					cellGroup.userData = { cellKey };
				}
				
				// Position cell at its grid coordinate with fixed offset based on position
				// Use sine function based on coordinates, not random values, for consistent placement
				const yOffset = Math.sin((x * 0.7) + (z * 0.5)) * 0.1;
				
				cellGroup.position.set(
					x - (_boardSize.width / 2) + 0.5,
					0.5 + yOffset,
					z - (_boardSize.height / 2) + 0.5
				);
				
				// Add to container
				cellsContainer.add(cellGroup);
			}
		}
		
		// Dispose of unused cells
		existingCells.forEach((cell, key) => {
			if (!usedCells.has(key)) {
				if (cell.geometry) cell.geometry.dispose();
				if (cell.material && cell.material.dispose) cell.material.dispose();
			}
		});
		
		// Only log initial rendering or significant changes
		if (cellsContainer.children.length > 0 && 
			(!lastCellCount || Math.abs(lastCellCount - cellsContainer.children.length) > 5)) {
			console.log(`Rendered ${cellsContainer.children.length} floating cells`);
			lastCellCount = cellsContainer.children.length;
		}
		
		return true;
	} catch (error) {
		console.error('Error updating board visualization:', error);
		return false;
	}
}

/**
 * Create a cell group with all its components
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {any} cellValue - Cell value for color
 * @returns {THREE.Group} Cell group
 */
function createCellGroup(x, z, cellValue) {
	// Create island cell group
	const cellGroup = new THREE.Group();
	
	// Create main cell - slightly larger than 1x1
	const geometry = new THREE.BoxGeometry(1.0, 1.0, 1.0);
	const color = getCellColor(cellValue);
	const material = new THREE.MeshStandardMaterial({ 
		color,
		roughness: 0.7,
		metalness: 0.2,
		shadowSide: THREE.FrontSide
	});
	
	const cell = new THREE.Mesh(geometry, material);
	cell.castShadow = true;
	cell.receiveShadow = true;
	
	// Add cell to group
	cellGroup.add(cell);
	
	// Add bottom extension to create depth effect
	// Use fixed seed based on position for consistent depth
	const seed = (x * 100) + z;
	const depthRandom = pseudoRandom(seed);
	const depth = 0.3 + depthRandom * 0.5;
	
	const bottomGeometry = new THREE.BoxGeometry(0.8, depth, 0.8);
	const bottomMaterial = new THREE.MeshStandardMaterial({
		color: darkenColor(color, 0.7),
		roughness: 0.9,
		metalness: 0.1
	});
	
	const bottomExtension = new THREE.Mesh(bottomGeometry, bottomMaterial);
	bottomExtension.position.y = -0.65;
	bottomExtension.castShadow = true;
	cellGroup.add(bottomExtension);
	
	// Add subtle fixed rotation based on position for organic feel
	cellGroup.rotation.y = (pseudoRandom(seed + 1) - 0.5) * 0.1;
	
	// Randomly add decorative elements to some cells - based on fixed position seed
	if (pseudoRandom(seed + 2) < 0.15) {
		addFixedCellDecoration(cellGroup, cellValue, seed + 3);
	}
	
	return cellGroup;
}

/**
 * Add decorative elements to cells with consistent results based on seed
 * @param {THREE.Group} cellGroup - Cell group to add decoration to
 * @param {any} cellValue - Cell value for context
 * @param {number} seed - Random seed
 */
function addFixedCellDecoration(cellGroup, cellValue, seed) {
	// Choose decoration type based on seed
	const decorationType = Math.floor(pseudoRandom(seed) * 3);
	
	switch (decorationType) {
		case 0: // Small crystal
			const crystalGeometry = new THREE.ConeGeometry(0.15, 0.4, 5);
			const crystalMaterial = new THREE.MeshStandardMaterial({
				color: 0xaaddff,
				transparent: true,
				opacity: 0.7,
				roughness: 0.2,
				metalness: 0.8
			});
			
			const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
			crystal.position.set(
				(pseudoRandom(seed + 1) - 0.5) * 0.5, 
				0.5, 
				(pseudoRandom(seed + 2) - 0.5) * 0.5
			);
			crystal.rotation.y = pseudoRandom(seed + 3) * Math.PI;
			cellGroup.add(crystal);
			break;
			
		case 1: // Small rock
			const rockGeometry = new THREE.DodecahedronGeometry(0.2, 0);
			const rockMaterial = new THREE.MeshStandardMaterial({
				color: 0x888888,
				roughness: 0.9,
				metalness: 0.1
			});
			
			const rock = new THREE.Mesh(rockGeometry, rockMaterial);
			rock.position.set(
				(pseudoRandom(seed + 4) - 0.5) * 0.6, 
				0.5, 
				(pseudoRandom(seed + 5) - 0.5) * 0.6
			);
			rock.rotation.set(
				pseudoRandom(seed + 6) * Math.PI,
				pseudoRandom(seed + 7) * Math.PI,
				pseudoRandom(seed + 8) * Math.PI
			);
			rock.scale.set(
				0.8 + pseudoRandom(seed + 9) * 0.4,
				0.8 + pseudoRandom(seed + 10) * 0.4,
				0.8 + pseudoRandom(seed + 11) * 0.4
			);
			cellGroup.add(rock);
			break;
			
		case 2: // Tiny plants/grass
			const plantGroup = new THREE.Group();
			const plantCount = 1 + Math.floor(pseudoRandom(seed + 12) * 3);
			
			for (let i = 0; i < plantCount; i++) {
				const stemGeometry = new THREE.CylinderGeometry(0.02, 0.01, 0.3, 4);
				const stemMaterial = new THREE.MeshStandardMaterial({
					color: 0x558822,
					roughness: 0.9
				});
				
				const stem = new THREE.Mesh(stemGeometry, stemMaterial);
				stem.position.set(
					(pseudoRandom(seed + 13 + i) - 0.5) * 0.4,
					0.15,
					(pseudoRandom(seed + 14 + i) - 0.5) * 0.4
				);
				
				// Consistent rotation based on seed
				stem.rotation.set(
					(pseudoRandom(seed + 15 + i) - 0.5) * 0.4,
					pseudoRandom(seed + 16 + i) * Math.PI * 2,
					(pseudoRandom(seed + 17 + i) - 0.5) * 0.4
				);
				
				plantGroup.add(stem);
			}
			
			plantGroup.position.y = 0.5;
			cellGroup.add(plantGroup);
			break;
	}
}

/**
 * Generate predictable random number from seed
 * @param {number} seed - Seed value
 * @returns {number} Random number between 0-1
 */
function pseudoRandom(seed) {
	// Simple but sufficient for visual consistency
	const x = Math.sin(seed) * 10000;
	return x - Math.floor(x);
}

/**
 * Create a darker version of a color
 * @param {number} color - Color in hex format
 * @param {number} factor - Darkening factor (0-1)
 * @returns {number} Darkened color
 */
function darkenColor(color, factor) {
	const r = (color >> 16) & 255;
	const g = (color >> 8) & 255;
	const b = color & 255;
	
	const newR = Math.floor(r * factor);
	const newG = Math.floor(g * factor);
	const newB = Math.floor(b * factor);
	
	return (newR << 16) | (newG << 8) | newB;
}

/**
 * Get color for a cell based on its value
 * @param {any} cellValue - Cell value
 * @returns {number} Color as hex value
 */
function getCellColor(cellValue) {
	// If it's a number (tetromino)
	if (typeof cellValue === 'number') {
		switch (cellValue) {
			case 1: return 0x00ffff; // Cyan (I)
			case 2: return 0xffff00; // Yellow (O)
			case 3: return 0x800080; // Purple (T)
			case 4: return 0x00ff00; // Green (S)
			case 5: return 0xff0000; // Red (Z)
			case 6: return 0x0000ff; // Blue (J)
			case 7: return 0xff8800; // Orange (L)
			default: return 0xcccccc; // Gray
		}
	}
	
	// If it's an object with player property
	if (cellValue && typeof cellValue === 'object' && cellValue.player) {
		return getPlayerColor(cellValue.player);
	}
	
	// Default color
	return 0xcccccc;
}

// Export required functions
export {
	RENDER_MODES,
	DEFAULT_SETTINGS
};

/**
 * Handle keyboard input for camera movement
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleCameraKeys(event) {
	// Ensure we have camera and controls
	if (!_camera || !_controls) return;
	
	const speed = 2; // Move speed
	
	// Only handle keyboard navigation if player is pressing SHIFT
	// This prevents conflict with game controls
	if (event.shiftKey) {
		switch (event.key) {
			case 'w': // Move forward
				_camera.position.z -= speed;
				_controls.target.z -= speed;
				_controls.update();
				break;
				
			case 's': // Move backward
				_camera.position.z += speed;
				_controls.target.z += speed;
				_controls.update();
				break;
				
			case 'a': // Move left
				_camera.position.x -= speed;
				_controls.target.x -= speed;
				_controls.update();
				break;
				
			case 'd': // Move right
				_camera.position.x += speed;
				_controls.target.x += speed;
				_controls.update();
				break;
				
			case 'q': // Rotate left around target
				_camera.position.x = _camera.position.x * Math.cos(0.1) - _camera.position.z * Math.sin(0.1);
				_camera.position.z = _camera.position.x * Math.sin(0.1) + _camera.position.z * Math.cos(0.1);
				_controls.update();
				break;
				
			case 'e': // Rotate right around target
				_camera.position.x = _camera.position.x * Math.cos(-0.1) - _camera.position.z * Math.sin(-0.1);
				_camera.position.z = _camera.position.x * Math.sin(-0.1) + _camera.position.z * Math.cos(-0.1);
				_controls.update();
				break;
				
			case 'r': // Reset camera
				_camera.position.set(20, 25, 20);
				_controls.target.set(8, 0, 8);
				_controls.update();
				break;
		}
		
		event.preventDefault(); // Prevent default browser scrolling
	}
}

/**
 * Focus camera on player's home area
 * @param {string} playerId - Player ID to focus on
 * @param {boolean} animate - Whether to animate the transition
 */
export function focusOnPlayerHomeArea(playerId, animate = true) {
	if (!_camera || !_controls) return;
	
	// Get player's home zone position
	const gameState = getGameState();
	if (!gameState || !gameState.homeZones || !gameState.homeZones[playerId]) {
		console.warn('Cannot focus on player, home zone not found');
		return;
	}
	
	const homeZone = gameState.homeZones[playerId];
	const centerX = homeZone.centerX || 8;
	const centerZ = homeZone.centerZ || 8;
	
	// Define target position and camera position
	const targetPosition = new THREE.Vector3(centerX, 0, centerZ);
	
	// Calculate camera position based on target
	// Position camera to view from angle that shows more of the board
	// Move camera further left to see more of the board ahead
	const cameraOffset = new THREE.Vector3(0, 20, 20); // Decreased X offset to move camera left
	const cameraPosition = targetPosition.clone().add(cameraOffset);
	
	if (animate) {
		// Animate camera movement
		const startPosition = _camera.position.clone();
		const startTarget = _controls.target.clone();
		const duration = 1500; // ms
		const startTime = Date.now();
		
		const animateCamera = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);
			// Use easing function for smoother animation
			const easeProgress = 1 - Math.cos(progress * Math.PI / 2);
			
			// Interpolate camera position
			_camera.position.lerpVectors(startPosition, cameraPosition, easeProgress);
			
			// Interpolate target
			_controls.target.lerpVectors(startTarget, targetPosition, easeProgress);
			
			// Update controls
			_controls.update();
			
			if (progress < 1) {
				requestAnimationFrame(animateCamera);
			} else {
				// Notify that camera animation is complete
				if (typeof gameStateManager !== 'undefined' && 
					typeof gameStateManager.onCameraAnimationComplete === 'function') {
					gameStateManager.onCameraAnimationComplete();
				}
			}
		};
		
		animateCamera();
	} else {
		// Instant camera movement
		_camera.position.copy(cameraPosition);
		_controls.target.copy(targetPosition);
		_controls.update();
		
		// Notify that camera animation is complete
		if (typeof gameStateManager !== 'undefined' && 
			typeof gameStateManager.onCameraAnimationComplete === 'function') {
			gameStateManager.onCameraAnimationComplete();
		}
	}
}
