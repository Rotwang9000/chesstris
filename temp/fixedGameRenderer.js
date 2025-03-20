/**
 * Game Renderer Utility
 *
 * Handles rendering of game elements for both 2D and 3D modes
 */

// Import animations module if available
try {
	import * as animations from './animations.js';
} catch (error) {
	console.warn('Animations module not available:', error);
}

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

// Global state variables
let _isInitialized = false;
let _container = null;
let _targetFPS = 60;
let _verbose = false;

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
 * Start render loop
 */
export function startRenderLoop() {
	try {
		if (!_isInitialized) {
			console.warn('Cannot start render loop: Renderer not initialized');
			return false;
		}
		
		if (isRenderLoopRunning) {
			console.warn('Render loop already running');
			return true;
		}
		
		console.log('Starting render loop');
		
		// Calculate frame interval based on target FPS
		const frameInterval = 1000 / _targetFPS;
		
		isRenderLoopRunning = true;
		
		// Render frame function
		const renderFrame = (timestamp) => {
			if (!isRenderLoopRunning) return;
			
			// Calculate delta time
			const now = timestamp || performance.now();
			const deltaTime = now - lastFrameTime;
			
			// Only render if enough time has passed or no frame limiting
			if (deltaTime >= frameInterval || !frameLimiterActive) {
				// Update last frame time
				lastFrameTime = now;
				
				// Update animations if available
				if (typeof updateAnimations === 'function') {
					updateAnimations(now, deltaTime);
				}
				
				// Render scene
				render(now);
				
				// Update FPS counter
				frameCount++;
				framesThisSecond++;
				
				if (now - lastFpsUpdate >= 1000) {
					currentFps = framesThisSecond;
					framesThisSecond = 0;
					lastFpsUpdate = now;
					
					// Update debug info if enabled
					if (_verbose) {
						updateDebugInfo();
					}
				}
			}
			
			// Request next frame
			animationFrameId = requestAnimationFrame(renderFrame);
		};
		
		// Start render loop
		animationFrameId = requestAnimationFrame(renderFrame);
		console.log('Render loop started');
		return true;
	} catch (error) {
		console.error('Error starting render loop:', error);
		return false;
	}
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
 * Initialize renderer
 * @param {HTMLElement} containerElement - Container element
 * @param {Object} options - Renderer options
 * @returns {Promise<boolean>} Whether initialization was successful
 */
export async function init(containerElement, options = {}) {
	try {
		if (_isInitialized) {
			console.warn('Renderer already initialized');
			return true;
		}
		
		console.log(`Initializing renderer in mode: ${options.renderMode || '3d'}`);
		
		// Store options
		_verbose = options.verbose || false;
		is3DMode = options.renderMode !== '2d';
		
		// Store container element reference
		_container = containerElement || document.getElementById('gameContainer');
		
		// Create container if it doesn't exist
		if (!_container) {
			console.log('Container not found, creating one');
			_container = document.createElement('div');
			_container.id = 'gameContainer';
			_container.style.width = '100%';
			_container.style.height = '100%';
			_container.style.position = 'absolute';
			_container.style.top = '0';
			_container.style.left = '0';
			document.body.appendChild(_container);
		}
		
		// Apply container styles
		_container.style.overflow = 'hidden';
		
		// Set up performance monitoring
		lastFrameTime = performance.now();
		frameCount = 0;
		framesThisSecond = 0;
		lastFpsUpdate = performance.now();
		currentFps = 0;
		
		// Create canvas
		canvas = document.createElement('canvas');
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		canvas.style.display = 'block';
		_container.appendChild(canvas);
		
		// Initialize renderer based on mode
		if (is3DMode) {
			// Set up 3D scene
			setup3DScene(_container);
		} else {
			// Get 2D context
			context = canvas.getContext('2d');
			if (!context) {
				console.error('Failed to get 2D context');
				return false;
			}
		}
		
		// Set up event listeners
		window.addEventListener('resize', onWindowResize);
		
		// Mark as initialized
		_isInitialized = true;
		console.log('Renderer initialized successfully');
		
		// Start render loop automatically
		startRenderLoop();
		console.log('Render loop started automatically');
		
		return true;
	} catch (error) {
		console.error('Error initializing renderer:', error);
		return false;
	}
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
 * Handle window resize
 */
function onWindowResize() {
	if (!canvas) return;
	
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	
	if (is3DMode && camera && renderer) {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight);
	}
}

/**
 * Create the game board in 3D
 */
export function createGameBoard(width = 16, height = 16) {
	if (!scene) return false;
	
	// Remove old board if it exists
	const existingBoard = scene.getObjectByName('gameBoard');
	if (existingBoard) {
		scene.remove(existingBoard);
	}
	
	// Create board container
	const boardGroup = new THREE.Group();
	boardGroup.name = 'gameBoard';
	
	// Create background plane
	const planeGeometry = new THREE.PlaneGeometry(width, height);
	const planeMaterial = new THREE.MeshBasicMaterial({ 
		color: 0x000033,
		side: THREE.DoubleSide,
		transparent: true,
		opacity: 0.3
	});
	const plane = new THREE.Mesh(planeGeometry, planeMaterial);
	plane.rotation.x = -Math.PI / 2; // Rotate to be horizontal
	plane.position.set(width / 2, -0.01, height / 2); // Position slightly below the grid
	boardGroup.add(plane);
	
	// Add to scene
	scene.add(boardGroup);
	
	// Center camera on board
	if (camera && controls) {
		camera.position.set(width / 2, 20, height + 15); // Position above and behind board
		camera.lookAt(width / 2, 0, height / 2); // Look at center of board
		controls.target.set(width / 2, 0, height / 2); // Orbit around center of board
		controls.update();
	}
}

/**
 * Update board visualization
 * @param {Array} board - Game board data
 */
export function updateBoardVisualization(board) {
	try {
		// Make sure board exists
		if (!board || !Array.isArray(board) || !scene) {
			console.warn('Invalid board data or scene not available');
			return false;
		}
		
		// Get board group or create it
		let boardGroup = scene.getObjectByName('gameBoard');
		if (!boardGroup) {
			boardGroup = new THREE.Group();
			boardGroup.name = 'gameBoard';
			scene.add(boardGroup);
		}
		
		// Create cells container
		let cellsContainer = boardGroup.getObjectByName('cells');
		if (!cellsContainer) {
			cellsContainer = new THREE.Group();
			cellsContainer.name = 'cells';
			boardGroup.add(cellsContainer);
		}
		
		// Clear existing cells
		while (cellsContainer.children.length > 0) {
			const child = cellsContainer.children[0];
			cellsContainer.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
		
		// Create cells based on board data
		const boardHeight = board.length;
		const boardWidth = boardHeight > 0 ? board[0].length : 0;
		
		// Create cells for non-empty board positions
		for (let z = 0; z < boardHeight; z++) {
			if (!board[z]) continue;
			
			for (let x = 0; x < board[z].length; x++) {
				const cellValue = board[z][x];
				if (cellValue) {
					// Create cell geometry
					const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
					
					// Basic material with blue color
					const material = new THREE.MeshStandardMaterial({
						color: getCellColor(cellValue),
						roughness: 0.7,
						metalness: 0.3
					});
					
					// Create mesh
					const cell = new THREE.Mesh(geometry, material);
					cell.position.set(x + 0.5, 0.5, z + 0.5);
					cell.userData.x = x;
					cell.userData.z = z;
					cell.userData.value = cellValue;
					
					// Add cell to container
					cellsContainer.add(cell);
				}
			}
		}
		
		return true;
	} catch (error) {
		console.error('Error updating board visualization:', error);
		return false;
	}
}

/**
 * Get color for a cell based on its value
 * @param {any} cellValue - Value of the cell
 * @returns {number} Color as THREE.js color number
 */
function getCellColor(cellValue) {
	// Default blue
	let color = 0x3366cc;
	
	// Check if cell value is an object with type
	if (typeof cellValue === 'object' && cellValue !== null) {
		// Check type property
		if (cellValue.type) {
			switch (cellValue.type) {
				case 'p1': return 0x3232FF; // Player 1 (blue)
				case 'p2': return 0xFF3232; // Player 2 (red)
				case 'p3': return 0x32FF32; // Player 3 (green)
				case 'p4': return 0xFFFF32; // Player 4 (yellow)
				case 'wall': return 0x323232; // Wall (dark gray)
				default: return 0x3366cc; // Default blue
			}
		}
		
		// Check player property
		if (cellValue.player !== undefined) {
			switch (cellValue.player) {
				case 1: return 0x3232FF; // Player 1 (blue)
				case 2: return 0xFF3232; // Player 2 (red)
				case 3: return 0x32FF32; // Player 3 (green)
				case 4: return 0xFFFF32; // Player 4 (yellow)
				default: return 0x3366cc; // Default blue
			}
		}
	}
	
	// Check if cell is a number
	if (typeof cellValue === 'number') {
		switch (cellValue) {
			case 1: return 0x00FFFF; // Cyan (I)
			case 2: return 0xFFFF00; // Yellow (O)
			case 3: return 0x800080; // Purple (T)
			case 4: return 0x00FF00; // Green (S)
			case 5: return 0xFF0000; // Red (Z)
			case 6: return 0x0000FF; // Blue (J)
			case 7: return 0xFF7F00; // Orange (L)
			default: return 0x3366cc; // Default blue
		}
	}
	
	// Check if cell is a string
	if (typeof cellValue === 'string') {
		switch (cellValue) {
			case 'p1': return 0x3232FF; // Player 1 (blue)
			case 'p2': return 0xFF3232; // Player 2 (red)
			case 'p3': return 0x32FF32; // Player 3 (green)
			case 'p4': return 0xFFFF32; // Player 4 (yellow)
			case 'wall': return 0x323232; // Wall (dark gray)
			case 'I': return 0x00FFFF; // Cyan
			case 'O': return 0xFFFF00; // Yellow
			case 'T': return 0x800080; // Purple
			case 'S': return 0x00FF00; // Green
			case 'Z': return 0xFF0000; // Red
			case 'J': return 0x0000FF; // Blue
			case 'L': return 0xFF7F00; // Orange
			default: return 0x3366cc; // Default blue
		}
	}
	
	return color;
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

// Export required functions
export {
	RENDER_MODES,
	DEFAULT_SETTINGS
};
