/**
 * Game Renderer Utility
 *
 * Handles rendering of game elements for both 2D and 3D modes
 */

// Set up verbose logging flag
window.VERBOSE_LOGGING = false;

// Enable/disable verbose logging
export function setVerboseLogging(enabled) {
	window.VERBOSE_LOGGING = enabled;
	console.log(`Verbose logging ${enabled ? 'enabled' : 'disabled'}`);
}

// Constants for rendering
const RENDER_MODES = {
	MODE_2D: '2d',
	MODE_3D: '3d'
};

// Default rendering settings
const DEFAULT_SETTINGS = {
	mode: RENDER_MODES.MODE_3D,
	cellSize: 40,
	boardPadding: 10,
	animationSpeed: 1.0,
	showGrid: true,
	showShadows: true,
	showGhostPiece: true,
	highlightValidMoves: true,
	theme: 'default',
	quality: 'medium'
};

// Global variables
let canvas = null;
let context = null;
let renderer = null;
let scene = null;
let camera = null;
let currentMode = null;
let _isInitialized = false;
let settings = { ...DEFAULT_SETTINGS };
let currentGameState = null;
let is3DMode = true; // Default to 3D mode
let isPaused = false;
let debugMode = true; // Set to true for debugging
let animationFrameId = null;
let lastFrameTime = performance.now(); // Use performance.now for accurate timing
let controls = null;
let isRenderLoopRunning = false;
let lastRenderTime = 0;
let lastBoardKey = null; // Cache for board state to avoid redundant updates
let lastEntitiesKey = null; // Cache for entities state

// Define loader and texture cache
let textureLoader;
const textureCache = {};

// Add variable to store animation state
let currentAnimationState = null;
let lastUpdateTime = 0;

// Import animations module
import * as animations from './animations.js';

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

// Add this near the top with other variables
let lastRendererUpdate = 0;
const MIN_RENDERER_UPDATE_INTERVAL = 100; // ms

// Note: debugMode and lastFrameTime are already declared at the top of the file

/**
 * Load a texture with error handling
 * @param {string} path - Path to texture
 * @param {Object} fallback - Fallback options if texture fails to load
 * @returns {THREE.Texture} The loaded texture or fallback
 */
function loadTexture(path, fallback = {}) {
	// Return from cache if exists
	if (textureCache[path]) {
		return textureCache[path];
	}
	
	// Create texture loader if not exists
	if (!textureLoader) {
		textureLoader = new THREE.TextureLoader();
	}
	
	// Default fallback is a colored material
	const defaultFallback = {
		color: 0x888888,
		roughness: 0.7,
		metalness: 0.3
	};
	
	const options = { ...defaultFallback, ...fallback };
	
	// Check if file exists before trying to load
	// Create a fallback immediately if the path doesn't look right
	if (!path || path.length < 5) {
		console.warn(`Invalid texture path: ${path}, using fallback`);
		return createFallbackTexture(options);
	}
	
	// Try to load texture, with error handling
	try {
		const texture = textureLoader.load(
			path,
			// Success callback
			(loadedTexture) => {
				console.log(`Texture loaded: ${path}`);
				// Store in cache
				textureCache[path] = loadedTexture;
			},
			// Progress callback (currently not used)
			undefined,
			// Error callback
			(error) => {
				console.warn(`Error loading texture ${path}:`, error);
				// Replace with fallback texture
				const fallbackTexture = createFallbackTexture(options);
				textureCache[path] = fallbackTexture;
			}
		);
		
		// Configure texture
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		
		// Cache it
		textureCache[path] = texture;
		
		return texture;
	} catch (error) {
		console.error(`Failed to load texture ${path}:`, error);
		return createFallbackTexture(options);
	}
}

/**
 * Create a fallback texture
 * @param {Object} options - Options for the fallback texture
 * @returns {THREE.Texture} Fallback texture
 */
function createFallbackTexture(options) {
	// Create a simple canvas with fallback color
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = `#${options.color.toString(16).padStart(6, '0')}`;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	const fallbackTexture = new THREE.CanvasTexture(canvas);
	return fallbackTexture;
}

// Default settings
let _container = null;
let _targetFPS = 60;
let _verbose = false; // Add verbose flag

/**
 * Set target FPS for frame limiting
 * @param {number} fps - Target frames per second (0 to disable limiting)
 */
export function setTargetFPS(fps) {
	_targetFPS = fps || 60;
	console.log(`Target FPS set to ${_targetFPS}`);
}

/**
 * Start the render loop
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
        
        // Set up frame timing variables
        let lastFrameTime = 0;
        let deltaTime = 0;
        let now = 0;
        
        // Set default frame limit if not already defined
        if (typeof _targetFPS === 'undefined') {
            _targetFPS = 60;
        }
        
        isRenderLoopRunning = true;
        
        // Render frame function
        const renderFrame = (timestamp) => {
            if (!isRenderLoopRunning) return;
            
            // Calculate delta time
            now = timestamp || performance.now();
            deltaTime = now - lastFrameTime;
            
            // Only render if enough time has passed or no frame limiting
            if (deltaTime >= frameInterval || !frameLimiterActive) {
                // Update last frame time
                lastFrameTime = now;
                
                // Update animations
                updateAnimations(now, deltaTime);
                
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
 * Stop the render loop
 */
export function stopRenderLoop() {
	if (animationFrameId !== null) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
		console.log('Render loop stopped');
	}
}

/**
 * Initialize the renderer
 * @param {HTMLElement} containerElement - Container element for the renderer
 * @param {Object} options - Renderer options
 * @returns {Promise<boolean>} - Whether initialization was successful
 */
export async function init(containerElement, options = {}) {
	try {
		if (_isInitialized) {
			console.warn('Renderer already initialized');
			return true;
		}
		
		console.log(`Initializing renderer in mode: ${options.renderMode || '3d'}`);
		
		// Store container element reference
		_container = containerElement || document.getElementById('gameContainer');
		
		// Store settings
		_verbose = options.verbose || false; // Set verbose from options
		is3DMode = options.renderMode !== '2d';
		
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
		
		// Create or get canvas
		canvas = _container.querySelector('canvas');
		if (!canvas) {
			canvas = document.createElement('canvas');
			canvas.width = window.innerWidth;
			
			// Calculate canvas height based on aspect ratio
			canvas.height = window.innerHeight;
			canvas.style.width = '100%';
			canvas.style.height = '100%';
			canvas.style.display = 'block';
			_container.appendChild(canvas);
		}
		
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
		
		try {
			_container.appendChild(canvas);
		} catch (error) {
			console.error('Failed to append canvas to container:', error);
		}
		
		// Set up event listeners
		window.addEventListener('resize', onWindowResize);
		
		// Set up OrbitControls if available
		try {
			if (typeof THREE !== 'undefined' && THREE.OrbitControls && camera) {
				console.log('Setting up OrbitControls');
				controls = new THREE.OrbitControls(camera, renderer.domElement);
				controls.enableDamping = true;
				controls.dampingFactor = 0.25;
				controls.screenSpacePanning = false;
				controls.maxPolarAngle = Math.PI / 2;
				controls.minDistance = 5;
				controls.maxDistance = 50;
				
				// Add reset button for camera
				addCameraResetButton(_container);
				
				// Add instructions for camera control
				addCameraInstructions(_container);
			} else {
				console.warn('OrbitControls not available, falling back to basic controls');
				setupBasicCameraControls(_container);
			}
		} catch (error) {
			console.warn('Error setting up OrbitControls, falling back to basic controls:', error);
			
			// If OrbitControls are not available, use basic controls
			setupBasicCameraControls(_container);
		}
		
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
 * @param {HTMLElement} container - Container element for the renderer
 * @returns {boolean} - Whether setup was successful
 */
export function setup3DScene(container) {
	try {
		console.log('Setting up 3D scene');
		
		// Create scene
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x0A1A2A); // Dark blue sky
		
		// Add fog for depth
		scene.fog = new THREE.FogExp2(0x0A1A2A, 0.03);
		
		// Create camera
		camera = new THREE.PerspectiveCamera(
			70,                                      // Field of view
			window.innerWidth / window.innerHeight,  // Aspect ratio
			0.1,                                     // Near clipping plane
			1000                                     // Far clipping plane
		);
		
		// Position camera to see the whole board
		camera.position.set(15, 20, 30);
		camera.lookAt(0, 0, 0);
		
		// Create renderer
		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.setClearColor(0x0A1A2A); // Same as scene.background
		
		// Append renderer to container
		if (container) {
			// Remove any existing canvas first
			const existingCanvas = container.querySelector('canvas');
			if (existingCanvas) {
				container.removeChild(existingCanvas);
			}
			
			// Append new renderer canvas
			container.appendChild(renderer.domElement);
		}
		
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
		
		// Setup environment
		setupEnvironment();
		
		// Add skybox
		createSkybox();
		
		// Add debug grid (temporarily)
		const gridHelper = new THREE.GridHelper(32, 32, 0x555555, 0x555555);
		gridHelper.position.y = -0.01;
		gridHelper.visible = false; // Hide grid for floating islands look
		scene.add(gridHelper);
		
		// Store reference to grid helper for later toggling
		gridHelperObj = gridHelper;
		
		console.log('3D scene setup complete');
		return true;
	} catch (error) {
		console.error('Error setting up 3D scene:', error);
		return false;
	}
}

/**
 * Handle keyboard events for camera and debug controls
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
	// Reset camera position with R key
	if (event.key === 'r' || event.key === 'R') {
		if (camera) {
			camera.position.set(15, 20, 30);
			camera.lookAt(0, 0, 0);
			if (controls) {
				controls.target.set(0, 0, 0);
				controls.update();
			}
			console.log('Camera position reset');
		}
	}
	
	// Toggle frame limiter with F key
	if (event.key === 'f' || event.key === 'F') {
		frameLimiterActive = !frameLimiterActive;
		console.log(`Frame limiting ${frameLimiterActive ? 'enabled' : 'disabled'}`);
	}
	
	// Set specific FPS values with number keys
	if (event.key >= '1' && event.key <= '9') {
		const fps = parseInt(event.key) * 10;
		setTargetFPS(fps);
	}
}

/**
 * Add on-screen instructions for camera controls
 * @param {HTMLElement} container - Container element 
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
			F: Toggle Frame Limit<br>
			1-9: Set FPS (10-90)
		`;
		
		try {
			container.appendChild(instructions);
		} catch (error) {
			console.warn('Failed to append camera instructions to container:', error);
		}
	} catch (error) {
		console.warn('Error adding camera instructions:', error);
		// Non-critical error, don't break initialization
	}
}

/**
 * Create the game board in 3D
 * @param {number} width - Board width
 * @param {number} height - Board height
 */
export function createGameBoard(width = 16, height = 16) {
	// Remove old board if it exists
	const existingBoard = scene.getObjectByName('gameBoard');
	if (existingBoard) {
		scene.remove(existingBoard);
	}
	
	// Create board container
	const boardGroup = new THREE.Group();
	boardGroup.name = 'gameBoard';
	
	// Create grid using lines for better performance
	const gridGeometry = new THREE.BufferGeometry();
	const gridMaterial = new THREE.LineBasicMaterial({ 
		color: 0x444444, 
		transparent: true,
		opacity: 0.5 
	});
	
	const gridPoints = [];
	
	// Create horizontal lines
	for (let z = 0; z <= height; z++) {
		gridPoints.push(0, 0, z);
		gridPoints.push(width, 0, z);
	}
	
	// Create vertical lines
	for (let x = 0; x <= width; x++) {
		gridPoints.push(x, 0, 0);
		gridPoints.push(x, 0, height);
	}
	
	gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
	const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
	boardGroup.add(grid);
	
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
 * Set up basic camera controls without OrbitControls
 * @param {HTMLElement} container - Container element for the renderer
 * @returns {boolean} - Whether setup was successful
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
			const rotateSpeed = 0.1;
			
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
				case 'Home':
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
 * @param {HTMLElement} container - Container element
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
		resetButton.style.fontFamily = 'Arial, sans-serif';
		resetButton.style.fontSize = '14px';
		
		// Add hover effect
		resetButton.addEventListener('mouseenter', () => {
			resetButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		});
		
		resetButton.addEventListener('mouseleave', () => {
			resetButton.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		});
		
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
		try {
			container.appendChild(resetButton);
		} catch (error) {
			console.warn('Failed to append reset button to container:', error);
		}
	} catch (error) {
		console.warn('Error adding camera reset button:', error);
		// Non-critical error, don't break initialization
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
		directionalLight.castShadow = settings.showShadows;
		
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
		
		// Add point light
		const pointLight = new THREE.PointLight(0xffffff, 0.3);
		pointLight.position.set(0, 50, 0);
		scene.add(pointLight);
		
		return true;
	} catch (error) {
		console.error('Error setting up lights:', error);
		return false;
	}
}

/**
 * Set up environment (skybox, ground, etc.)
 */
export function setupEnvironment() {
	try {
		// Add skybox
		createSkybox();
		
		// Add board decorations
		addBoardDecorations();
		
		// Add Russian-themed environmental elements
		addRussianEnvironmentElements();
		
		return true;
	} catch (error) {
		console.error('Error setting up environment:', error);
		return false;
	}
}

/**
 * Update board visualization
 * @param {Array} board - Game board data
 * @returns {boolean} - Whether update was successful
 */
export function updateBoardVisualization(board) {
	try {
		// Log board data for debugging
		console.log('Updating board visualization with data:', board);
		
		// Make sure board exists
		if (!board || !Array.isArray(board) || board.length === 0) {
			console.warn('Empty or invalid board data provided to updateBoardVisualization');
			
			// Create a debug grid if board is empty/invalid
			if (scene) {
				createGameBoard(16, 16);
				
				// Add some debug cells to visualize
				addDebugCells();
			}
			return;
		}
		
		// Get board group or create it if it doesn't exist
		let boardGroup = scene.getObjectByName('gameBoard');
		if (!boardGroup) {
			boardGroup = new THREE.Group();
			boardGroup.name = 'gameBoard';
			scene.add(boardGroup);
		}
		
		// Clear existing cells
		const existingCells = boardGroup.getObjectByName('cells');
		if (existingCells) {
			boardGroup.remove(existingCells);
		}
		
		// Create cells container
		const cellsContainer = new THREE.Group();
		cellsContainer.name = 'cells';
		boardGroup.add(cellsContainer);
		
		// Create cells based on board data
		const boardHeight = board.length;
		const boardWidth = boardHeight > 0 ? board[0].length : 0;
		
		// Update game board size if needed
		if (boardWidth > 0 && boardHeight > 0) {
			createGameBoard(boardWidth, boardHeight);
		}
		
		// Create cells for non-empty board positions
		for (let z = 0; z < boardHeight; z++) {
			if (!board[z]) continue;
			
			for (let x = 0; x < board[z].length; x++) {
				const cellValue = board[z][x];
				if (cellValue) {
					// Create cell geometry
					const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
					
					// Get appropriate material
					const material = getCellMaterial(cellValue);
					
					// Create mesh
					const cell = new THREE.Mesh(geometry, material);
					cell.position.set(x + 0.5, 0.5, z + 0.5);
					cell.userData.type = 'cell';
					cell.userData.x = x;
					cell.userData.z = z;
					cell.userData.value = cellValue;
					
					// Add cell to container
					cellsContainer.add(cell);
					
					// Add floating animation
					createFloatingAnimation(cell);
					
					console.log(`Created cell at (${x}, ${z}) with value:`, cellValue);
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
 * Add debug cells to visualize the board when there's no valid game data
 */
function addDebugCells() {
	try {
		// Get board group
		let boardGroup = scene.getObjectByName('gameBoard');
		if (!boardGroup) return;
		
		// Create cells container
		const cellsContainer = new THREE.Group();
		cellsContainer.name = 'debugCells';
		boardGroup.add(cellsContainer);
		
		// Create some cells in a pattern
		const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
		
		// Create a pattern of cells
		for (let z = 0; z < 3; z++) {
			for (let x = 0; x < 3; x++) {
				const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
				const material = new THREE.MeshStandardMaterial({
					color: colors[(z * 3 + x) % colors.length],
					roughness: 0.3,
					metalness: 0.7
				});
				
				const cell = new THREE.Mesh(geometry, material);
				cell.position.set(x * 2 + 4, 0.5, z * 2 + 4);
				cell.userData.type = 'debugCell';
				cell.userData.x = x;
				cell.userData.z = z;
				
				// Add cell to container
				cellsContainer.add(cell);
				
				// Add floating animation
				createFloatingAnimation(cell);
			}
		}
		
		console.log('Added debug cells to visualize the board');
		return true;
	} catch (error) {
		console.error('Error adding debug cells:', error);
		return false;
	}
}

/**
 * Check if a cell is connected to other cells
 * @param {Array} board - Game board
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {boolean} - Whether the cell is connected
 */
function isConnectedToOtherCells(board, x, z) {
	// Check adjacent cells (right, left, up, down)
	const directions = [
		{dx: 1, dz: 0},
		{dx: -1, dz: 0},
		{dx: 0, dz: 1},
		{dx: 0, dz: -1}
	];
	
	let connectedCount = 0;
	
	for (const dir of directions) {
		const newX = x + dir.dx;
		const newZ = z + dir.dz;
		
		// Check if the adjacent cell is within bounds and has a value
		if (board[newZ] && board[newZ][newX]) {
			connectedCount++;
		}
	}
	
	return connectedCount > 0;
}

/**
 * Update appearance of an existing cell
 * @param {THREE.Mesh} cell - Cell mesh to update
 * @param {*} cellValue - Value from the game board
 * @param {boolean} isConnected - Whether the cell is connected to others
 */
function updateCellAppearance(cell, cellValue, isConnected = false) {
	if (!cell) return;
	
	// Update material if needed
	const material = getCellMaterial(cellValue);
	cell.material.color.copy(material.color);
	
	// Add slight glow effect to enhance visibility in the dark sky
	cell.material.emissive = new THREE.Color(
		cell.material.color.r * 0.2,
		cell.material.color.g * 0.2,
		cell.material.color.b * 0.2
	);
	
	// Update floating animation parameters
	let floatingAnimation = activeAnimations.floatingCells.find(a => a.cell === cell);
	
	if (!floatingAnimation) {
		floatingAnimation = createFloatingAnimation(cell);
		activeAnimations.floatingCells.push(floatingAnimation);
	}
	
	// Connected cells float less than isolated ones to create the island effect
	floatingAnimation.amplitude = isConnected ? 0.05 : 0.15;
	
	// Update other properties based on cell type
	if (typeof cellValue === 'object' && cellValue.properties) {
		const { height, highlight } = cellValue.properties;
		
		// Apply height if specified
		if (height !== undefined) {
			cell.scale.y = height;
			cell.position.y = height * 0.5;
		}
		
		// Apply highlight if needed
		if (highlight) {
			// Add stronger emission for highlighted cells
			cell.material.emissive = new THREE.Color(
				cell.material.color.r * 0.4,
				cell.material.color.g * 0.4,
				cell.material.color.b * 0.4
			);
		}
	}
}

/**
 * Create floating animation for a cell
 * @param {THREE.Mesh} cell - Cell mesh to animate
 * @returns {Object} - Animation object
 */
function createFloatingAnimation(cell) {
	try {
		if (!cell) return null;
		
		// Store original position
		const originalY = cell.position.y;
		
		// Random offset for animation to make cells not float in sync
		const timeOffset = Math.random() * Math.PI * 2;
		
		// Random amplitude between 0.1 and 0.3
		const amplitude = 0.1 + Math.random() * 0.2;
		
		// Random period between 1 and 3 seconds
		const period = 1 + Math.random() * 2;
		
		// Random rotation amplitude
		const rotationAmplitude = Math.random() * 0.01;
		
		// Animation function
		const animate = (time, deltaTime) => {
			if (!cell) return;
			
			// Calculate wave
			const wave = Math.sin((time * 0.001 / period) + timeOffset);
			
			// Update position
			cell.position.y = originalY + wave * amplitude;
			
			// Add slight rotation to enhance floating effect
			cell.rotation.x = Math.sin(time * 0.0005) * rotationAmplitude;
			cell.rotation.z = Math.cos(time * 0.0007) * rotationAmplitude;
		};
		
		// Add to animation callbacks
		if (animationCallbacks) {
			animationCallbacks.push(animate);
		}
		
		return {
			cell,
			originalY,
			animate,
			timeOffset,
			amplitude,
			period,
			active: true
		};
	} catch (error) {
		console.error('Error creating floating animation:', error);
		return null;
	}
}

/**
 * Create a skybox with Russian theme
 */
function createSkybox() {
	// Use a gradient sky
	const vertexShader = `
		varying vec3 vWorldPosition;
		void main() {
			vec4 worldPosition = modelMatrix * vec4(position, 1.0);
			vWorldPosition = worldPosition.xyz;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`;
	
	const fragmentShader = `
		uniform vec3 topColor;
		uniform vec3 bottomColor;
		uniform float offset;
		uniform float exponent;
		varying vec3 vWorldPosition;
		void main() {
			float h = normalize(vWorldPosition + offset).y;
			gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
		}
	`;
	
	const uniforms = {
		topColor: { value: new THREE.Color(0x0077ff) },
		bottomColor: { value: new THREE.Color(0xffffff) },
		offset: { value: 33 },
		exponent: { value: 0.6 }
	};
	
	const skyGeo = new THREE.SphereGeometry(500, 32, 15);
	const skyMat = new THREE.ShaderMaterial({
		uniforms: uniforms,
		vertexShader: vertexShader,
		fragmentShader: fragmentShader,
		side: THREE.BackSide
	});
	
	const sky = new THREE.Mesh(skyGeo, skyMat);
	sky.name = 'env_sky';
	scene.add(sky);
}

/**
 * Add ornate decorations to the board edges for Russian theme
 */
function addBoardDecorations() {
	// Add decorative columns at corners
	const columnGeometry = new THREE.CylinderGeometry(0.3, 0.3, 2, 8);
	const columnMaterial = new THREE.MeshStandardMaterial({
		color: 0x8B4513,
		roughness: 0.7,
		metalness: 0.3
	});
	
	// Positions for the corner columns - adjust based on board size
	const boardWidth = 10;
	const boardHeight = 20;
	
	const cornerPositions = [
		[-0.5, 1, -0.5],  // Front left
		[boardWidth - 0.5, 1, -0.5],   // Front right
		[-0.5, 1, boardHeight - 0.5],  // Back left
		[boardWidth - 0.5, 1, boardHeight - 0.5]    // Back right
	];
	
	cornerPositions.forEach((pos, index) => {
		const column = new THREE.Mesh(columnGeometry, columnMaterial);
		
		column.position.set(pos[0], pos[1], pos[2]);
		column.castShadow = true;
		column.name = `env_column_${index}`;
		scene.add(column);
		
		// Add ornate top to each column
		const topGeometry = new THREE.SphereGeometry(0.4, 8, 8);
		const topMaterial = new THREE.MeshStandardMaterial({
			color: 0xB8860B,
			roughness: 0.5,
			metalness: 0.5
		});
		const top = new THREE.Mesh(topGeometry, topMaterial);
		top.position.set(pos[0], pos[1] + 1.1, pos[2]);
		top.castShadow = true;
		top.name = `env_columnTop_${index}`;
		scene.add(top);
	});
}

/**
 * Add Russian-themed environmental elements
 */
function addRussianEnvironmentElements() {
	try {
		// Add stylized onion dome in the distance (Russian church)
		const domeBaseGeometry = new THREE.CylinderGeometry(2, 2, 4, 16);
		const domeTopGeometry = new THREE.SphereGeometry(2, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
		const domeSpikeGeometry = new THREE.ConeGeometry(0.5, 2, 8);
		
		// Use a fallback material since the texture might not exist
		const domeMaterial = new THREE.MeshStandardMaterial({
			color: 0x4682B4, // Steel blue color
			roughness: 0.7,
			metalness: 0.3
		});
		
		const domeBase = new THREE.Mesh(domeBaseGeometry, domeMaterial);
		domeBase.position.set(-20, 5, -25);
		
		const domeTop = new THREE.Mesh(domeTopGeometry, domeMaterial);
		domeTop.position.set(-20, 9, -25);
		
		const domeSpike = new THREE.Mesh(domeSpikeGeometry, domeMaterial);
		domeSpike.position.set(-20, 11, -25);
		
		scene.add(domeBase);
		scene.add(domeTop);
		scene.add(domeSpike);
		
		// Add some smaller domes
		const colors = [0x8B0000, 0x006400, 0x4B0082, 0x000080]; // Dark red, dark green, indigo, navy
		
		for (let i = 0; i < 4; i++) {
			const smallBase = new THREE.Mesh(
				new THREE.CylinderGeometry(1, 1, 2, 16),
				new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7, metalness: 0.3 })
			);
			const smallTop = new THREE.Mesh(
				new THREE.SphereGeometry(1, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
				new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7, metalness: 0.3 })
			);
			const smallSpike = new THREE.Mesh(
				new THREE.ConeGeometry(0.25, 1, 8),
				new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.3, metalness: 0.8 }) // Gold
			);
			
			const xOffset = -15 + i * 3;
			smallBase.position.set(xOffset, 2, -23);
			smallTop.position.set(xOffset, 4, -23);
			smallSpike.position.set(xOffset, 5, -23);
			
			scene.add(smallBase);
			scene.add(smallTop);
			scene.add(smallSpike);
		}
		
		console.log('Russian environment elements added successfully');
	} catch (error) {
		console.error('Error adding Russian environment elements:', error);
		// Continue with other initialization steps even if this fails
	}
}

/**
 * Add forest of stylized Russian trees
 */
function addTreesForest() {
	// Tree geometries
	const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 5, 8);
	const leafGeometry = new THREE.ConeGeometry(2, 4, 8);
	
	// Tree materials
	const trunkMaterial = new THREE.MeshStandardMaterial({
		color: 0x8B4513,
		roughness: 0.9,
		metalness: 0.1
	});
	
	const leafMaterial = new THREE.MeshStandardMaterial({
		color: 0x228B22,
		roughness: 0.8,
		metalness: 0.1
	});
	
	// Tree positions - on both sides of the board
	const treePositions = [
		[-15, 0, -15],
		[-10, 0, -20],
		[-20, 0, -10],
		[-12, 0, -25],
		[-25, 0, -15],
		[25, 0, -15],
		[20, 0, -10],
		[15, 0, -20],
		[30, 0, -25]
	];
	
	// Create tree group
	const treeGroup = new THREE.Group();
	treeGroup.name = 'env_trees';
	
	treePositions.forEach((pos, index) => {
		// Create tree trunk
		const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
		trunk.position.set(pos[0], pos[1] + 2.5, pos[2]);
		trunk.castShadow = true;
		trunk.name = `env_treeTrunk_${index}`;
		
		// Create tree leaves
		const leaves = new THREE.Mesh(leafGeometry, leafMaterial);
		leaves.position.set(pos[0], pos[1] + 6, pos[2]);
		leaves.castShadow = true;
		leaves.name = `env_treeLeaves_${index}`;
		
		// Add to tree group
		treeGroup.add(trunk);
		treeGroup.add(leaves);
	});
	
	scene.add(treeGroup);
}

/**
 * Add distant mountains to the scene
 */
function addDistantMountains() {
	// Mountain geometry
	const mountainGeometry = new THREE.ConeGeometry(20, 30, 4);
	
	// Mountain material
	const mountainMaterial = new THREE.MeshStandardMaterial({
		color: 0x708090,
		roughness: 0.9,
		metalness: 0.1
	});
	
	// Mountain positions
	const mountainPositions = [
		[-50, -10, -100],
		[-80, -10, -100],
		[-20, -10, -100],
		[20, -10, -100],
		[60, -10, -100]
	];
	
	// Create mountain group
	const mountainGroup = new THREE.Group();
	mountainGroup.name = 'env_mountains';
	
	mountainPositions.forEach((pos, index) => {
		const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
		mountain.position.set(pos[0], pos[1], pos[2]);
		mountain.scale.set(
			0.7 + Math.random() * 0.6,
			0.7 + Math.random() * 0.6,
			0.7 + Math.random() * 0.6
		);
		mountain.rotation.y = Math.random() * Math.PI;
		mountain.castShadow = false; // Too far to cast shadows
		mountain.name = `env_mountain_${index}`;
		mountainGroup.add(mountain);
	});
	
	scene.add(mountainGroup);
}

/**
 * Add snow particle effect
 */
function addSnowEffect() {
	// Create particles
	const snowCount = 1000;
	const snowGeometry = new THREE.BufferGeometry();
	const snowVertices = [];
	
	for (let i = 0; i < snowCount; i++) {
		// Random position in a cube around the board
		const x = Math.random() * 80 - 40;
		const y = Math.random() * 50;
		const z = Math.random() * 80 - 40;
		
		snowVertices.push(x, y, z);
	}
	
	snowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(snowVertices, 3));
	
	// Snow material
	const snowMaterial = new THREE.PointsMaterial({
		color: 0xffffff,
		size: 0.3,
		transparent: true,
		opacity: 0.8
	});
	
	// Create snow particles
	const snow = new THREE.Points(snowGeometry, snowMaterial);
	snow.name = 'env_snow';
	scene.add(snow);
	
	// Animate snow
	function animateSnow() {
		// Get current positions
		const positions = snow.geometry.attributes.position.array;
		
		// Update each particle
		for (let i = 0; i < positions.length; i += 3) {
			// Move down slowly
			positions[i + 1] -= 0.05;
			
			// Add slight sideways movement
			positions[i] += Math.sin(Date.now() * 0.001 + i) * 0.01;
			
			// Reset if below ground
			if (positions[i + 1] < 0) {
				positions[i + 1] = 50;
			}
		}
		
		// Mark for update
		snow.geometry.attributes.position.needsUpdate = true;
		
		// Continue animation
		requestAnimationFrame(animateSnow);
	}
	
	// Start animation
	animateSnow();
}

/**
 * Add clouds to the sky
 */
function addClouds() {
	// Create a cloud group
	const cloudGroup = new THREE.Group();
	cloudGroup.name = 'env_clouds';
	
	// Create several cloud puffs
	const puffGeometry = new THREE.SphereGeometry(2, 8, 8);
	const cloudMaterial = new THREE.MeshStandardMaterial({
		color: 0xffffff,
		roughness: 1.0,
		metalness: 0.0,
		transparent: true,
		opacity: 0.9
	});
	
	// Create clouds at different positions
	const cloudPositions = [
		[-30, 40, -50],
		[20, 35, -60],
		[-10, 45, -40],
		[40, 50, -30],
		[-40, 55, -20]
	];
	
	cloudPositions.forEach((pos, index) => {
		const cloudPuff = new THREE.Group();
		
		// Create multiple puffs per cloud
		for (let i = 0; i < 5; i++) {
			const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
			puff.position.set(
				Math.random() * 5 - 2.5,
				Math.random() * 2 - 1,
				Math.random() * 5 - 2.5
			);
			puff.scale.set(
				0.7 + Math.random() * 0.6,
				0.7 + Math.random() * 0.6,
				0.7 + Math.random() * 0.6
			);
			cloudPuff.add(puff);
		}
		
		cloudPuff.position.set(pos[0], pos[1], pos[2]);
		cloudPuff.name = `env_cloud_${index}`;
		cloudGroup.add(cloudPuff);
	});
	
	scene.add(cloudGroup);
	
	// Animate clouds slowly
	animateClouds(cloudGroup);
}

/**
 * Animate clouds with slow movement
 */
function animateClouds(cloudGroup) {
	// Store original positions
	cloudGroup.children.forEach(cloud => {
		cloud.userData.originalX = cloud.position.x;
		cloud.userData.speed = 0.02 + Math.random() * 0.03;
		cloud.userData.amplitude = 10 + Math.random() * 20;
	});
	
	// Animation function
	function animate() {
		cloudGroup.children.forEach(cloud => {
			cloud.position.x = cloud.userData.originalX + Math.sin(Date.now() * 0.0001 * cloud.userData.speed) * cloud.userData.amplitude;
		});
		
		requestAnimationFrame(animate);
	}
	
	animate();
}

/**
 * Handle window resize
 */
function handleResize() {
	if (!canvas) return;
	
	// Update canvas size
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	
	if (currentMode === RENDER_MODES.MODE_2D) {
		// No additional setup needed for 2D
	} else if (renderer && camera) {
		// Update renderer size
		renderer.setSize(window.innerWidth, window.innerHeight);
		
		// Update camera aspect ratio
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}
}

/**
 * Set the current game state
 * @param {Object} gameState - New game state
 */
export function setGameState(gameState) {
	try {
		// Throttle updates to prevent excessive rendering
		const now = Date.now();
		if (now - lastRendererUpdate < MIN_RENDERER_UPDATE_INTERVAL) {
			// Only log in debug mode and when explicitly requested
			if (debugMode && window.VERBOSE_LOGGING) {
				console.log(`Renderer update throttled`);
			}
			return;
		}
		lastRendererUpdate = now;
		
		// Skip update if state is null
		if (!gameState) {
			return;
		}
		
		// Check if game state has actually changed in a meaningful way
		if (currentGameState) {
			const currentBoardKey = JSON.stringify(currentGameState.board || []);
			const newBoardKey = JSON.stringify(gameState.board || []);
			
			const currentTetrominoKey = JSON.stringify(currentGameState.currentTetromino || null);
			const newTetrominoKey = JSON.stringify(gameState.currentTetromino || null);
			
			const currentChessPiecesKey = JSON.stringify(currentGameState.chessPieces || []);
			const newChessPiecesKey = JSON.stringify(gameState.chessPieces || []);
			
			// If visual elements haven't changed, just update UI and return
			if (currentBoardKey === newBoardKey && 
				currentTetrominoKey === newTetrominoKey && 
				currentChessPiecesKey === newChessPiecesKey) {
				
				updateUI3D(gameState);
				currentGameState = gameState;
				return;
			}
		}
		
		// Store the new state
		currentGameState = gameState;
		
		// If in 3D mode, update the 3D rendering
		if (is3DMode && scene) {
			// Update board visualization based on the new state
			try {
				// Directly call the updateBoardVisualization function
				updateBoardVisualization(gameState.board || []);
			} catch (error) {
				console.warn('Error updating board visualization:', error);
			}
			
			// Update chess pieces and tetrominos
			try {
				updateGameEntities(gameState);
			} catch (error) {
				console.warn('Error updating game entities:', error);
			}
			
			// Update UI elements
			updateUI3D(gameState);
		}
		
		// Update game state visualization in general
		if (_isInitialized) {
			handleGameStateChange(gameState);
		}
		
		// Update turn timer
		if (gameState.turnTimeRemaining !== undefined) {
			updateTurnTimer(gameState.turnTimeRemaining);
		}
		
		// Only log in debug mode and when explicitly requested
		if (debugMode && window.VERBOSE_LOGGING) {
			console.log('UI updated based on game state');
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
 * Render in 2D mode
 */
function render2D() {
	if (!context || !canvas) {
		return;
	}
	
	// Clear canvas
	context.clearRect(0, 0, canvas.width, canvas.height);
	
	// Draw background
	context.fillStyle = '#121212';
	context.fillRect(0, 0, canvas.width, canvas.height);
	
	// If we have a game state, render it
	if (currentGameState) {
		renderBoard2D(currentGameState);
	} else {
		// Draw some debug info
		context.fillStyle = '#ffffff';
		context.font = '14px Arial';
		context.fillText('2D Renderer Active - No Game State', 10, 20);
	}
}

/**
 * Render the game board in 2D
 * @param {Object} gameState - Game state object
 */
function renderBoard2D(gameState) {
	try {
		// Calculate board size and position
		const cellSize = settings.cellSize || 30;
		const boardWidth = (gameState.board && gameState.board[0]?.length) || 10;
		const boardHeight = (gameState.board && gameState.board.length) || 20;
		const boardPixelWidth = boardWidth * cellSize;
		const boardPixelHeight = boardHeight * cellSize;
		
		// Calculate board position (centered)
		const boardX = (canvas.width - boardPixelWidth) / 2;
		const boardY = (canvas.height - boardPixelHeight) / 2;
		
		// Draw board background
		context.fillStyle = '#1a1a1a';
		context.fillRect(boardX, boardY, boardPixelWidth, boardPixelHeight);
		
		// Draw grid lines if enabled
		if (settings.showGrid) {
			context.strokeStyle = '#333333';
			context.lineWidth = 1;
			
			// Vertical grid lines
			for (let x = 0; x <= boardWidth; x++) {
				const lineX = boardX + x * cellSize;
				context.beginPath();
				context.moveTo(lineX, boardY);
				context.lineTo(lineX, boardY + boardPixelHeight);
				context.stroke();
			}
			
			// Horizontal grid lines
			for (let y = 0; y <= boardHeight; y++) {
				const lineY = boardY + y * cellSize;
				context.beginPath();
				context.moveTo(boardX, lineY);
				context.lineTo(boardX + boardPixelWidth, lineY);
				context.stroke();
			}
		}
		
		// Draw cells
		if (gameState.board) {
			for (let y = 0; y < boardHeight; y++) {
				for (let x = 0; x < boardWidth; x++) {
					const cell = gameState.board[y][x];
					if (cell) {
						const cellX = boardX + x * cellSize;
						const cellY = boardY + y * cellSize;
						
						// Draw cell
						context.fillStyle = getCellColor2D(cell);
						context.fillRect(cellX, cellY, cellSize, cellSize);
						
						// Draw cell border
						context.strokeStyle = '#000000';
						context.lineWidth = 1;
						context.strokeRect(cellX, cellY, cellSize, cellSize);
					}
				}
			}
		}
		
		// Draw ghost piece if enabled
		if (settings.showGhostPiece && gameState.currentTetromino && gameState.ghostPosition) {
			renderGhostPiece2D(
				gameState.currentTetromino.shape,
				gameState.ghostPosition,
				gameState.currentTetromino.type,
				boardX,
				boardY,
				cellSize
			);
		}
		
		// Draw current tetromino
		if (gameState.currentTetromino) {
			renderTetromino2D(gameState.currentTetromino, boardX, boardY, cellSize);
		}
		
		// Draw chess pieces
		if (gameState.chessPieces) {
			renderChessPieces2D(gameState.chessPieces, boardX, boardY, cellSize);
		}
		
		// Draw UI elements
		renderUI2D(gameState, boardX, boardY, cellSize, boardPixelWidth, boardPixelHeight);
	} catch (error) {
		console.error('Error rendering board in 2D:', error);
	}
}

/**
 * Render tetromino in 2D
 * @param {Object} tetromino - Tetromino object
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderTetromino2D(tetromino, boardX, boardY, cellSize) {
	try {
		const { shape, position, type } = tetromino;
		
		if (!shape || !position) {
			return;
		}
		
		// Draw tetromino blocks
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const worldX = position.x + x;
					const worldY = position.y + y;
					const cellX = boardX + worldX * cellSize;
					const cellY = boardY + worldY * cellSize;
					
					// Draw tetromino cell
					context.fillStyle = getTetrominoColor2D(type);
					context.fillRect(cellX, cellY, cellSize, cellSize);
					
					// Draw cell border
					context.strokeStyle = '#000000';
					context.lineWidth = 1;
					context.strokeRect(cellX, cellY, cellSize, cellSize);
				}
			}
		}
		
		// Draw height indicator
		if (position.z !== undefined && position.z > 0) {
			// Calculate center of tetromino
			let centerX = 0;
			let centerY = 0;
			let blockCount = 0;
			
			for (let y = 0; y < shape.length; y++) {
				for (let x = 0; x < shape[y].length; x++) {
					if (shape[y][x]) {
						centerX += (position.x + x);
						centerY += (position.y + y);
						blockCount++;
					}
				}
			}
			
			if (blockCount > 0) {
				centerX = boardX + (centerX / blockCount) * cellSize + cellSize / 2;
				centerY = boardY + (centerY / blockCount) * cellSize + cellSize / 2;
				
				// Draw height number
				context.fillStyle = '#ffffff';
				context.font = 'bold ' + Math.floor(cellSize * 0.8) + 'px Arial';
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				
				// Background circle for better visibility
				context.beginPath();
				context.arc(centerX, centerY, cellSize * 0.4, 0, Math.PI * 2);
				context.fillStyle = 'rgba(0, 0, 0, 0.7)';
				context.fill();
				
				// Height text
				context.fillStyle = '#ffffff';
				context.fillText(Math.ceil(position.z).toString(), centerX, centerY);
			}
		}
	} catch (error) {
		console.error('Error rendering tetromino in 2D:', error);
	}
}

/**
 * Render ghost piece in 2D
 * @param {Array} shape - Tetromino shape
 * @param {Object} position - Ghost position
 * @param {string|number} type - Tetromino type
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderGhostPiece2D(shape, position, type, boardX, boardY, cellSize) {
	try {
		if (!shape || !position) {
			return;
		}
		
		// Draw ghost tetromino blocks
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const worldX = position.x + x;
					const worldY = position.y + y;
					const cellX = boardX + worldX * cellSize;
					const cellY = boardY + worldY * cellSize;
					
					// Get tetromino color and make it transparent
					const color = getTetrominoColor2D(type);
					const colorValues = color.match(/\d+/g);
					if (colorValues && colorValues.length >= 3) {
						// Draw ghost cell (outline only)
						context.strokeStyle = `rgba(${colorValues[0]}, ${colorValues[1]}, ${colorValues[2]}, 0.5)`;
						context.lineWidth = 2;
						context.strokeRect(cellX + 2, cellY + 2, cellSize - 4, cellSize - 4);
						
						// Add pattern to ghost piece
						context.fillStyle = `rgba(${colorValues[0]}, ${colorValues[1]}, ${colorValues[2]}, 0.2)`;
						context.fillRect(cellX + 2, cellY + 2, cellSize - 4, cellSize - 4);
					}
				}
			}
		}
	} catch (error) {
		console.error('Error rendering ghost piece in 2D:', error);
	}
}

/**
 * Render chess pieces in 2D
 * @param {Array} chessPieces - Chess pieces array
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderChessPieces2D(chessPieces, boardX, boardY, cellSize) {
	try {
		for (const piece of chessPieces) {
			if (!piece || !piece.type || !piece.position) {
				continue;
			}
			
			const { type, position, player } = piece;
			const { x, y } = position;
			
			const pieceX = boardX + x * cellSize;
			const pieceY = boardY + y * cellSize;
			
			// Draw chess piece
			const pieceChar = getChessPieceChar(type, player);
			const color = player === 1 ? '#ffffff' : '#000000';
			const outline = player === 1 ? '#000000' : '#ffffff';
			
			// Draw piece
			context.font = 'bold ' + Math.floor(cellSize * 0.7) + 'px Arial';
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			
			// Draw outline for better visibility
			context.strokeStyle = outline;
			context.lineWidth = 2;
			context.strokeText(pieceChar, pieceX + cellSize / 2, pieceY + cellSize / 2);
			
			// Draw piece
			context.fillStyle = color;
			context.fillText(pieceChar, pieceX + cellSize / 2, pieceY + cellSize / 2);
		}
	} catch (error) {
		console.error('Error rendering chess pieces in 2D:', error);
	}
}

/**
 * Render UI elements in 2D
 */
function renderUI2D(gameState, boardX, boardY, cellSize, boardPixelWidth, boardPixelHeight) {
	try {
		// Draw next tetromino preview
		if (gameState.nextTetromino) {
			const previewX = boardX + boardPixelWidth + 20;
			const previewY = boardY;
			const previewSize = cellSize * 0.8;
			
			// Draw preview box
			context.fillStyle = '#1a1a1a';
			context.fillRect(previewX, previewY, previewSize * 4, previewSize * 4);
			
			// Draw label
			context.fillStyle = '#ffffff';
			context.font = '16px Arial';
			context.textAlign = 'left';
			context.textBaseline = 'top';
			context.fillText('Next:', previewX, previewY - 20);
			
			// Draw next tetromino
			const { shape, type } = gameState.nextTetromino;
			if (shape) {
				// Get tetromino dimensions
				let minX = shape[0].length;
				let minY = shape.length;
				let maxX = 0;
				let maxY = 0;
				
				for (let y = 0; y < shape.length; y++) {
					for (let x = 0; x < shape[y].length; x++) {
						if (shape[y][x]) {
							minX = Math.min(minX, x);
							minY = Math.min(minY, y);
							maxX = Math.max(maxX, x);
							maxY = Math.max(maxY, y);
						}
					}
				}
				
				const tetrominoWidth = maxX - minX + 1;
				const tetrominoHeight = maxY - minY + 1;
				
				// Center tetromino in preview box
				const offsetX = previewX + (4 - tetrominoWidth) * previewSize / 2;
				const offsetY = previewY + (4 - tetrominoHeight) * previewSize / 2;
				
				// Draw tetromino
				for (let y = 0; y < shape.length; y++) {
					for (let x = 0; x < shape[y].length; x++) {
						if (shape[y][x]) {
							const cellX = offsetX + (x - minX) * previewSize;
							const cellY = offsetY + (y - minY) * previewSize;
							
							// Draw cell
							context.fillStyle = getTetrominoColor2D(type);
							context.fillRect(cellX, cellY, previewSize, previewSize);
							
							// Draw cell border
							context.strokeStyle = '#000000';
							context.lineWidth = 1;
							context.strokeRect(cellX, cellY, previewSize, previewSize);
						}
					}
				}
			}
		}
		
		// Draw score and level
		if (gameState.score !== undefined || gameState.level !== undefined) {
			const infoX = boardX;
			const infoY = boardY + boardPixelHeight + 20;
			
			context.fillStyle = '#ffffff';
			context.font = '16px Arial';
			context.textAlign = 'left';
			context.textBaseline = 'top';
			
			if (gameState.score !== undefined) {
				context.fillText(`Score: ${gameState.score}`, infoX, infoY);
			}
			
			if (gameState.level !== undefined) {
				context.fillText(`Level: ${gameState.level}`, infoX, infoY + 25);
			}
		}
	} catch (error) {
		console.error('Error rendering UI in 2D:', error);
	}
}

/**
 * Get character for chess piece
 * @param {string} type - Piece type
 * @param {number} player - Player number
 * @returns {string} Chess piece character
 */
function getChessPieceChar(type, player) {
	const pieces = {
		'pawn': '♟',
		'knight': '♞',
		'bishop': '♝',
		'rook': '♜',
		'queen': '♛',
		'king': '♚'
	};
	
	return pieces[type.toLowerCase()] || '?';
}

/**
 * Get color for a cell in 2D
 * @param {number|string} cell - Cell value
 * @returns {string} Color as CSS color string
 */
function getCellColor2D(cell) {
	// Default colors for different cell types
	const colors = {
		1: 'rgb(0, 255, 255)', // Cyan (I)
		2: 'rgb(255, 255, 0)', // Yellow (O)
		3: 'rgb(128, 0, 128)', // Purple (T)
		4: 'rgb(0, 255, 0)',   // Green (S)
		5: 'rgb(255, 0, 0)',   // Red (Z)
		6: 'rgb(0, 0, 255)',   // Blue (J)
		7: 'rgb(255, 127, 0)', // Orange (L)
		'p1': 'rgb(50, 50, 150)', // Player 1 home zone
		'p2': 'rgb(150, 50, 50)',  // Player 2 home zone
		'wall': 'rgb(50, 50, 50)'  // Wall
	};
	
	// If cell is an object with a type property, use that
	if (typeof cell === 'object' && cell.type) {
		return colors[cell.type] || 'rgb(150, 150, 150)';
	}
	
	// Otherwise use the cell value directly
	return colors[cell] || 'rgb(150, 150, 150)';
}

/**
 * Get color for a tetromino in 2D
 * @param {number|string} type - Tetromino type
 * @returns {string} Color as CSS color string
 */
function getTetrominoColor2D(type) {
	const colors = {
		'I': 'rgb(0, 255, 255)', // Cyan
		'O': 'rgb(255, 255, 0)', // Yellow
		'T': 'rgb(128, 0, 128)', // Purple
		'S': 'rgb(0, 255, 0)',   // Green
		'Z': 'rgb(255, 0, 0)',   // Red
		'J': 'rgb(0, 0, 255)',   // Blue
		'L': 'rgb(255, 127, 0)', // Orange
		1: 'rgb(0, 255, 255)',   // Cyan (I)
		2: 'rgb(255, 255, 0)',   // Yellow (O)
		3: 'rgb(128, 0, 128)',   // Purple (T)
		4: 'rgb(0, 255, 0)',     // Green (S)
		5: 'rgb(255, 0, 0)',     // Red (Z)
		6: 'rgb(0, 0, 255)',     // Blue (J)
		7: 'rgb(255, 127, 0)'    // Orange (L)
	};
	
	return colors[type] || 'rgb(150, 150, 150)';
}

/**
 * Update all animations
 * @param {number} timestamp - Current timestamp
 * @param {number} deltaTime - Time since last frame in ms
 */
function updateAnimations(timestamp, deltaTime) {
	try {
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
		
		// Update victory/defeat animations if active
		if (victoryAnimation && victoryAnimation.update) {
			victoryAnimation.update(deltaTime);
		}
		
		if (defeatAnimation && defeatAnimation.update) {
			defeatAnimation.update(deltaTime);
		}
	} catch (error) {
		console.error('Error updating animations:', error);
	}
}

/**
 * Render in 3D mode
 * @param {number} timestamp - Current timestamp
 * @returns {boolean} - Whether the render was successful
 */
function render3D(timestamp) {
	try {
		if (!renderer || !scene || !camera) {
			console.warn('Cannot render: missing 3D components');
			return false;
		}
		
		// Calculate delta time
		const deltaTime = timestamp - (lastFrameTime || timestamp);
		lastFrameTime = timestamp;
		
		// Update controls if available
		if (controls && typeof controls.update === 'function') {
			controls.update();
		}
		
		// Render the scene
		renderer.render(scene, camera);
		
		// Update FPS counter
		frameCount++;
		framesThisSecond++;
		
		if (timestamp - lastFpsUpdate >= 1000) {
			currentFps = framesThisSecond;
			framesThisSecond = 0;
			lastFpsUpdate = timestamp;
			
			// Update debug info
			updateDebugInfo();
		}
		
		return true;
	} catch (error) {
		console.error('Error rendering in 3D:', error);
		return false;
	}
}

/**
 * Handle window resize for 3D scene
 */
function onWindowResize() {
	if (!renderer || !camera) return;
	
	// Update renderer size
	renderer.setSize(window.innerWidth, window.innerHeight);
	
	// Update camera aspect ratio
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
}

/**
 * Update UI elements based on game state
 * @param {Object} gameState - Current game state
 */
export function updateUI3D(gameState) {
	try {
		if (!gameState) return;
		
		// Update scores
		if (gameState.players) {
			updateScoreDisplay(gameState.players);
		}
		
		// Update turn indicator
		if (gameState.currentPlayer) {
			updateTurnIndicator(gameState.currentPlayer, gameState.turnPhase);
		}
		
		// Update turn timer
		if (gameState.turnTimeRemaining !== undefined) {
			updateTurnTimer(gameState.turnTimeRemaining);
		}
		
		// Only log in debug mode and when explicitly requested
		if (debugMode && window.VERBOSE_LOGGING) {
			console.log('UI updated based on game state');
		}
	} catch (error) {
		console.error('Error updating UI:', error);
	}
}

/**
 * Update score display
 * @param {Array} players - Player data
 */
export function updateScoreDisplay(players) {
	try {
		if (!players) return;
		
		// Get score elements
		const player1ScoreElement = document.getElementById('player1-score');
		const player2ScoreElement = document.getElementById('player2-score');
		
		// Update scores if elements exist
		if (player1ScoreElement && players[0]) {
			player1ScoreElement.textContent = players[0].score || 0;
		}
		
		if (player2ScoreElement && players[1]) {
			player2ScoreElement.textContent = players[1].score || 0;
		}
	} catch (error) {
		console.error('Error updating score display:', error);
	}
}

/**
 * Update turn indicator
 * @param {string} currentPlayer - Current player ID
 * @param {string} turnPhase - Current turn phase
 */
export function updateTurnIndicator(currentPlayer, turnPhase) {
	try {
		// Get turn indicator element
		const turnIndicator = document.getElementById('turn-indicator');
		if (!turnIndicator) return;
		
		// Update indicator text
		turnIndicator.textContent = `${currentPlayer}'s turn - ${turnPhase}`;
		
		// Update indicator color
		turnIndicator.className = `turn-indicator ${currentPlayer}`;
	} catch (error) {
		console.error('Error updating turn indicator:', error);
	}
}

/**
 * Update turn timer display
 * @param {number} timeRemaining - Time remaining in ms
 */
export function updateTurnTimer(timeRemaining) {
	try {
		// Get timer element
		const timerElement = document.getElementById('turn-timer');
		if (!timerElement) return;
		
		// Convert to seconds and prevent console logging
		const seconds = Math.ceil(timeRemaining / 1000);
		
		// Update timer text - this was accidentally logging to console
		timerElement.textContent = `${seconds}`;
		
		// Update timer color based on urgency
		if (seconds <= 5) {
			timerElement.className = 'turn-timer urgent';
		} else if (seconds <= 15) {
			timerElement.className = 'turn-timer warning';
		} else {
			timerElement.className = 'turn-timer';
		}
	} catch (error) {
		console.error('Error updating turn timer:', error);
	}
}

/**
 * Create row clearing animation for completed rows
 * @param {Array<number>} rowsToRemove - Array of row indices to clear
 */
export function createRowClearingAnimation(rowsToRemove) {
	if (!rowsToRemove || !rowsToRemove.length || !scene) return;
	
	// Get board width from current game state
	const boardWidth = currentGameState?.board?.[0]?.length || 10;
	
	// Create row clearing animation
	const rowAnimations = animations.createRowClearingAnimation(scene, rowsToRemove, boardWidth);
	
	console.log(`Created animation for clearing ${rowsToRemove.length} rows`);
	
	return rowAnimations;
}

/**
 * Create tetromino attachment animation
 * @param {Object} tetromino - Tetromino data
 */
export function createTetrominoAttachAnimation(tetromino) {
	if (!tetromino || !scene) return;
	
	return animations.createTetrominoAttachAnimation(scene, tetromino);
}

/**
 * Create tetromino disintegration animation
 * @param {Object} tetromino - Tetromino data
 */
export function createTetrominoDisintegrationAnimation(tetromino) {
	if (!tetromino || !scene) return;
	
	return animations.createTetrominoDisintegrationAnimation(scene, tetromino);
}

/**
 * Render scene
 * @param {number} time - Current time
 */
export function render(time) {
	if (!_isInitialized) {
		return;
	}
	
	if (is3DMode) {
		render3D(time);
	} else {
		render2D();
	}
}

/**
 * Convert screen coordinates to board coordinates
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate
 * @returns {Object|null} - Board coordinates or null if outside board
 */
export function screenToBoardCoordinates(screenX, screenY) {
	if (!camera || !scene) return null;
	
	// Create a ray from the camera to the mouse position
	const mouse = new THREE.Vector2();
	mouse.x = (screenX / window.innerWidth) * 2 - 1;
	mouse.y = -(screenY / window.innerHeight) * 2 + 1;
	
	// Create raycaster
	const raycaster = new THREE.Raycaster();
	raycaster.setFromCamera(mouse, camera);
	
	// Find the board group
	const boardGroup = scene.getObjectByName('game_board');
	if (!boardGroup) return null;
	
	// Create an invisible plane at y=0 to intersect with
	const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
	const planeMaterial = new THREE.MeshBasicMaterial({
		visible: false
	});
	const plane = new THREE.Mesh(planeGeometry, planeMaterial);
	plane.rotation.x = -Math.PI / 2; // Make horizontal
	plane.position.set(0, 0, 0);     // Place at board level
	
	// Add plane to scene temporarily
	scene.add(plane);
	
	// Cast ray and check for intersection with plane
	const intersects = raycaster.intersectObject(plane);
	
	// Remove plane from scene
	scene.remove(plane);
	plane.geometry.dispose();
	plane.material.dispose();
	
	// If no intersection, return null
	if (intersects.length === 0) return null;
	
	// Get intersection point
	const point = intersects[0].point;
	
	// Convert to board coordinates
	const x = Math.floor(point.x);
	const z = Math.floor(point.z);
	
	// Check if coordinates are within board boundaries
	const boardWidth = currentGameState?.board?.[0]?.length || 8;
	const boardHeight = currentGameState?.board?.length || 8;
	
	if (x < 0 || x >= boardWidth || z < 0 || z >= boardHeight) {
		return null;
	}
	
	return { x, z };
}

/**
 * Show victory animation
 * @param {Object} player - Player who won
 */
export function showVictoryAnimation(player) {
	// Clean up any existing animations
	hideVictoryAnimation();
	hideDefeatAnimation();
	
	// Import animations module
	import('./animations.js').then(animations => {
		// Create victory animation
		victoryAnimation = animations.createVictoryAnimation(scene, camera, player);
		
		// Add animation to the render loop
		animationCallbacks.push(() => {
			if (victoryAnimation) {
				victoryAnimation.animate();
				victoryAnimation.orbitCamera();
			}
		});
		
		console.log('Victory animation created');
	}).catch(error => {
		console.error('Error creating victory animation:', error);
	});
}

/**
 * Hide victory animation
 */
export function hideVictoryAnimation() {
	if (victoryAnimation) {
		victoryAnimation.dispose();
		victoryAnimation = null;
		
		// Reset camera
		resetCamera();
	}
}

/**
 * Show defeat animation
 */
export function showDefeatAnimation() {
	// Clean up any existing animations
	hideVictoryAnimation();
	hideDefeatAnimation();
	
	// Import animations module
	import('./animations.js').then(animations => {
		// Create defeat animation
		defeatAnimation = animations.createDefeatAnimation(scene, camera);
		
		// Add animation to the render loop
		animationCallbacks.push(() => {
			if (defeatAnimation) {
				defeatAnimation.animate();
				defeatAnimation.darkenScene();
				defeatAnimation.shakeCamera();
			}
		});
		
		console.log('Defeat animation created');
	}).catch(error => {
		console.error('Error creating defeat animation:', error);
	});
}

/**
 * Hide defeat animation
 */
export function hideDefeatAnimation() {
	if (defeatAnimation) {
		defeatAnimation.dispose();
		defeatAnimation = null;
		
		// Reset camera
		resetCamera();
	}
}

/**
 * Handle game state change
 * @param {Object} newState - New game state
 * @param {Object} oldState - Previous game state (optional)
 */
export function handleGameStateChange(newState, oldState = null) {
	// Only log in debug mode
	if (debugMode) {
		console.log('Handling game state change');
	}
	
	try {
		// Update the UI
		updateUI3D(newState);
		
		// Check for game over
		if (newState.gameOver) {
			if (newState.winner === 'player1') {
				showVictoryAnimation(1);
			} else if (newState.winner === 'player2') {
				showVictoryAnimation(2);
			} else {
				// Draw or other game over condition
				showDefeatAnimation();
			}
		}
		
		// Check for animations to play
		if (newState.animations) {
			for (const animation of newState.animations) {
				switch (animation.type) {
					case 'ROW_CLEAR':
						createRowClearingAnimation(animation.data.rows);
						break;
					case 'TETROMINO_ATTACH':
						createTetrominoAttachAnimation(animation.data.tetromino);
						break;
					case 'TETROMINO_DISINTEGRATE':
						createTetrominoDisintegrationAnimation(animation.data.tetromino);
						break;
					case 'CHESS_CAPTURE':
						// TODO: Implement chess capture animation
						break;
					case 'CHESS_CHECK':
						// TODO: Implement chess check animation
						break;
					default:
						// Unknown animation type
						if (debugMode) {
							console.warn('Unknown animation type:', animation.type);
						}
				}
			}
		}
	} catch (error) {
		console.error('Error handling game state change:', error);
	}
}

/**
 * Update the game board visualization based on game state
 * @param {Object} gameState - Game state to visualize
 */
export function updateGameBoardVisualization(gameState) {
	try {
		if (!scene || !gameState || !gameState.board) {
			return false;
		}
		
		// Create a cache key for the current board state to avoid redundant updates
		const boardKey = JSON.stringify(gameState.board);
		
		// If the board hasn't changed since last update, skip rendering
		if (boardKey === lastBoardKey) {
			return true;
		}
		
		// Store current board key for future comparison
		lastBoardKey = boardKey;
		
		// Find or create the board group
		let boardGroup = scene.getObjectByName('game_board');
		if (!boardGroup) {
			boardGroup = new THREE.Group();
			boardGroup.name = 'game_board';
			scene.add(boardGroup);
		}
		
		// Clear previous board cells
		const existingCells = [];
		boardGroup.traverse(child => {
			if (child.name && child.name.startsWith('cell_')) {
				existingCells.push(child);
			}
		});
		
		// Remove old cells that shouldn't be there anymore
		existingCells.forEach(cell => {
			boardGroup.remove(cell);
		});
		
		// Create/update cells based on game state
		const board = gameState.board;
		const cellSize = settings.cellSize || 1;
		const padding = 0.05; // Small gap between cells
		
		for (let z = 0; z < board.length; z++) {
			for (let x = 0; x < board[z].length; x++) {
				const cellValue = board[z][x];
				
				// Skip empty cells
				if (!cellValue) continue;
				
				// Create cell mesh
				const cellName = `cell_${x}_${z}`;
				let cell = boardGroup.getObjectByName(cellName);
				
				if (!cell) {
					// Create new cell geometry
					const geometry = new THREE.BoxGeometry(
						cellSize - padding * 2,
						cellSize - padding * 2,
						cellSize - padding * 2
					);
					
					// Determine material based on cell value
					const material = getCellMaterial(cellValue);
					
					// Create mesh
					cell = new THREE.Mesh(geometry, material);
					cell.name = cellName;
					cell.castShadow = true;
					cell.receiveShadow = settings.showShadows;
					
					// Add to board group
					boardGroup.add(cell);
				}
				
				// Position cell
				cell.position.set(
					x * cellSize + cellSize / 2,
					cellSize / 2, // Half height
					z * cellSize + cellSize / 2
				);
				
				// Update cell appearance if needed
				updateCellAppearance2(cell, cellValue);
			}
		}
		
		// Only log during debug
		if (debugMode) {
			console.log('Board visualization updated');
		}
		return true;
	} catch (error) {
		console.error('Error updating board visualization:', error);
		return false;
	}
}

/**
 * Get cell material based on cell value
 * @param {*} cellValue - Value from the game board
 * @returns {THREE.Material} Material for the cell
 */
function getCellMaterial(cellValue) {
	// Default colors for different cell types
	const colors = {
		1: 0x00FFFF, // Cyan (I)
		2: 0xFFFF00, // Yellow (O)
		3: 0x800080, // Purple (T)
		4: 0x00FF00, // Green (S)
		5: 0xFF0000, // Red (Z)
		6: 0x0000FF, // Blue (J)
		7: 0xFF7F00, // Orange (L)
		'p1': 0x3232FF, // Player 1 home zone
		'p2': 0xFF3232, // Player 2 home zone
		'wall': 0x323232 // Wall
	};
	
	// Determine color
	let color;
	if (typeof cellValue === 'object' && cellValue.type) {
		color = colors[cellValue.type] || 0x888888;
	} else {
		color = colors[cellValue] || 0x888888;
	}
	
	// Create material
	return new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3
	});
}

/**
 * Update appearance of an existing cell
 * @param {THREE.Mesh} cell - Cell mesh to update
 * @param {*} cellValue - Value from the game board
 */
function updateCellAppearance2(cell, cellValue) {
	if (!cell) return;
	
	// Update material if needed
	const material = getCellMaterial(cellValue);
	cell.material.color.copy(material.color);
	
	// Update other properties based on cell type
	if (typeof cellValue === 'object' && cellValue.properties) {
		const { height, floating, highlight } = cellValue.properties;
		
		// Apply height if specified
		if (height !== undefined) {
			cell.scale.y = height;
			cell.position.y = height * 0.5;
		}
		
		// Apply floating animation if needed
		if (floating) {
			// Add floating animation to activeAnimations if not already there
			if (!activeAnimations.floatingCells.find(a => a.cell === cell)) {
				const animation = createFloatingAnimation2(cell);
				activeAnimations.floatingCells.push(animation);
			}
		}
		
		// Apply highlight if needed
		if (highlight) {
			// Add emission to material
			cell.material.emissive = new THREE.Color(0x444444);
			cell.material.emissiveIntensity = 0.5;
		} else {
			// Remove emission
			cell.material.emissive = new THREE.Color(0x000000);
			cell.material.emissiveIntensity = 0;
		}
	}
}

/**
 * Create a floating animation for a cell
 * @param {THREE.Mesh} cell - Cell to animate
 * @returns {Object} Animation object
 */
function createFloatingAnimation2(cell) {
	const originalY = cell.position.y;
	const amplitude = 0.15; // Default amplitude - how high it floats
	const period = 2000 + Math.random() * 2000; // Time for one cycle in ms
	const startTime = performance.now() - Math.random() * 2000; // Random start time for varied motion
	
	return {
		cell,
		amplitude, // Can be adjusted based on whether the cell is part of an island
		originalY,
		update: function(deltaTime) {
			const time = performance.now();
			const phase = ((time - startTime) % period) / period;
			const offset = this.amplitude * Math.sin(phase * Math.PI * 2);
			cell.position.y = originalY + offset;
			
			// Add subtle rotation for more dynamic feel
			cell.rotation.x = Math.sin(phase * Math.PI * 2) * 0.01;
			cell.rotation.z = Math.cos(phase * Math.PI * 2) * 0.01;
		},
		isComplete: false
	};
}

/**
 * Update game entities based on game state
 * @param {Object} gameState - Game state to visualize
 */
export function updateGameEntities(gameState) {
	try {
		if (!scene || !gameState) {
			return false;
		}
		
		// Create cache keys for entities to avoid redundant updates
		const tetrominoKey = gameState.currentTetromino ? 
			JSON.stringify(gameState.currentTetromino) : 'null';
		const ghostKey = gameState.ghostPosition ? 
			JSON.stringify(gameState.ghostPosition) : 'null';
		const chessPiecesKey = gameState.chessPieces ? 
			JSON.stringify(gameState.chessPieces) : 'null';
			
		// Combined key for all entities
		const entitiesKey = `${tetrominoKey}|${ghostKey}|${chessPiecesKey}`;
		
		// If entities haven't changed, skip rendering
		if (entitiesKey === lastEntitiesKey) {
			return true;
		}
		
		// Store current entities key for future comparison
		lastEntitiesKey = entitiesKey;
		
		// Update tetrominos
		updateCurrentTetromino(gameState.currentTetromino);
		
		// Update ghost piece
		updateGhostPiece(gameState.currentTetromino, gameState.ghostPosition);
		
		// Update chess pieces
		updateChessPieces(gameState.chessPieces);
		
		// Only log in debug mode
		if (debugMode) {
			console.log('Game entities updated');
		}
		
		return true;
	} catch (error) {
		console.error('Error updating game entities:', error);
		return false;
	}
}

/**
 * Update current tetromino visualization
 * @param {Object} tetromino - Current tetromino data
 */
function updateCurrentTetromino(tetromino) {
	if (!scene || !tetromino) return;
	
	// Find or create tetromino group
	let tetrominoGroup = scene.getObjectByName('current_tetromino');
	if (!tetrominoGroup) {
		tetrominoGroup = new THREE.Group();
		tetrominoGroup.name = 'current_tetromino';
		scene.add(tetrominoGroup);
	}
	
	// Clear previous tetromino blocks
	while (tetrominoGroup.children.length) {
		const child = tetrominoGroup.children[0];
		tetrominoGroup.remove(child);
		
		if (child.geometry) child.geometry.dispose();
		if (child.material) child.material.dispose();
	}
	
	// Create new tetromino visualization
	const { shape, position, type } = tetromino;
	if (!shape || !position) return;
	
	const cellSize = settings.cellSize || 1;
	const padding = 0.05; // Small gap between blocks
	
	// Get tetromino color
	const colors = {
		'I': 0x00FFFF, // Cyan
		'O': 0xFFFF00, // Yellow
		'T': 0x800080, // Purple
		'S': 0x00FF00, // Green
		'Z': 0xFF0000, // Red
		'J': 0x0000FF, // Blue
		'L': 0xFF7F00, // Orange
		1: 0x00FFFF, // Cyan (I)
		2: 0xFFFF00, // Yellow (O)
		3: 0x800080, // Purple (T)
		4: 0x00FF00, // Green (S)
		5: 0xFF0000, // Red (Z)
		6: 0x0000FF, // Blue (J)
		7: 0xFF7F00  // Orange (L)
	};
	
	const color = colors[type] || 0x888888;
	
	// Create block geometry
	const geometry = new THREE.BoxGeometry(
		cellSize - padding * 2,
		cellSize - padding * 2,
		cellSize - padding * 2
	);
	
	// Create material with slight emission for active piece
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.2 // Subtle glow
	});
	
	// Create blocks for each cell in the shape
	for (let y = 0; y < shape.length; y++) {
		for (let x = 0; x < shape[y].length; x++) {
			if (shape[y][x]) {
				const block = new THREE.Mesh(geometry, material);
				
				// Position the block
				block.position.set(
					(position.x + x) * cellSize + cellSize / 2,
					(position.z || 0) * cellSize + cellSize / 2, // Height if defined
					(position.y + y) * cellSize + cellSize / 2
				);
				
				block.castShadow = true;
				block.receiveShadow = settings.showShadows;
				
				tetrominoGroup.add(block);
			}
		}
	}
}

/**
 * Update ghost piece visualization
 * @param {Object} tetromino - Current tetromino data
 * @param {Object} ghostPosition - Ghost piece position
 */
function updateGhostPiece(tetromino, ghostPosition) {
	if (!scene || !tetromino || !ghostPosition || !settings.showGhostPiece) return;
	
	// Find or create ghost piece group
	let ghostGroup = scene.getObjectByName('ghost_piece');
	if (!ghostGroup) {
		ghostGroup = new THREE.Group();
		ghostGroup.name = 'ghost_piece';
		scene.add(ghostGroup);
	}
	
	// Clear previous ghost blocks
	while (ghostGroup.children.length) {
		const child = ghostGroup.children[0];
		ghostGroup.remove(child);
		
		if (child.geometry) child.geometry.dispose();
		if (child.material) child.material.dispose();
	}
	
	// Create new ghost visualization
	const { shape, type } = tetromino;
	if (!shape) return;
	
	const cellSize = settings.cellSize || 1;
	const padding = 0.1; // Larger gap for ghost piece
	
	// Get tetromino color but make it transparent
	const colors = {
		'I': 0x00FFFF, // Cyan
		'O': 0xFFFF00, // Yellow
		'T': 0x800080, // Purple
		'S': 0x00FF00, // Green
		'Z': 0xFF0000, // Red
		'J': 0x0000FF, // Blue
		'L': 0xFF7F00, // Orange
		1: 0x00FFFF, // Cyan (I)
		2: 0xFFFF00, // Yellow (O)
		3: 0x800080, // Purple (T)
		4: 0x00FF00, // Green (S)
		5: 0xFF0000, // Red (Z)
		6: 0x0000FF, // Blue (J)
		7: 0xFF7F00  // Orange (L)
	};
	
	const color = colors[type] || 0x888888;
	
	// Create transparent material for ghost
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3,
		transparent: true,
		opacity: 0.3,
		wireframe: true
	});
	
	// Create blocks for each cell in the shape
	for (let y = 0; y < shape.length; y++) {
		for (let x = 0; x < shape[y].length; x++) {
			if (shape[y][x]) {
				// Use wireframe box for ghost piece
				const geometry = new THREE.BoxGeometry(
					cellSize - padding * 2,
					cellSize - padding * 2,
					cellSize - padding * 2
				);
				
				const block = new THREE.Mesh(geometry, material);
				
				// Position the block
				block.position.set(
					(ghostPosition.x + x) * cellSize + cellSize / 2,
					(ghostPosition.z || 0) * cellSize + cellSize / 2, // Height if defined
					(ghostPosition.y + y) * cellSize + cellSize / 2
				);
				
				block.castShadow = false;
				block.receiveShadow = false;
				
				ghostGroup.add(block);
			}
		}
	}
}

/**
 * Update chess pieces visualization
 * @param {Array} chessPieces - Array of chess pieces
 */
function updateChessPieces(chessPieces) {
	if (!scene) return;
	
	// Find or create chess pieces group
	let chessPiecesGroup = scene.getObjectByName('chess_pieces');
	if (!chessPiecesGroup) {
		chessPiecesGroup = new THREE.Group();
		chessPiecesGroup.name = 'chess_pieces';
		scene.add(chessPiecesGroup);
	}
	
	// If no chess pieces, clear the group and return
	if (!chessPieces || chessPieces.length === 0) {
		while (chessPiecesGroup.children.length) {
			const child = chessPiecesGroup.children[0];
			chessPiecesGroup.remove(child);
			
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
		return;
	}
	
	// Track which pieces are still valid
	const validPieceIds = new Set();
	
	// Update or create chess pieces
	for (const piece of chessPieces) {
		if (!piece || !piece.type || !piece.position) continue;
		
		const { id, type, position, player } = piece;
		const pieceId = id || `${type}_${player}_${position.x}_${position.y}`;
		validPieceIds.add(pieceId);
		
		// Find existing piece or create new one
		let chessPiece = chessPiecesGroup.getObjectByName(pieceId);
		
		if (!chessPiece) {
			// Create new chess piece
			chessPiece = createChessPiece(type, player);
			chessPiece.name = pieceId;
			chessPiecesGroup.add(chessPiece);
		}
		
		// Position the piece
		const cellSize = settings.cellSize || 1;
		chessPiece.position.set(
			position.x * cellSize + cellSize / 2,
			(position.height || 0) * cellSize + cellSize, // Slightly elevated
			position.y * cellSize + cellSize / 2
		);
		
		// Add highlight if piece is selected
		if (piece.selected) {
			// Create or update highlight
			let highlight = chessPiece.getObjectByName('highlight');
			if (!highlight) {
				const geometry = new THREE.RingGeometry(cellSize * 0.6, cellSize * 0.8, 16);
				const material = new THREE.MeshBasicMaterial({
					color: 0xFFFF00,
					transparent: true,
					opacity: 0.7,
					side: THREE.DoubleSide
				});
				
				highlight = new THREE.Mesh(geometry, material);
				highlight.name = 'highlight';
				highlight.rotation.x = -Math.PI / 2; // Lay flat
				highlight.position.y = 0.1; // Just above the ground
				
				chessPiece.add(highlight);
			}
		} else {
			// Remove highlight if not selected
			const highlight = chessPiece.getObjectByName('highlight');
			if (highlight) {
				chessPiece.remove(highlight);
				
				if (highlight.geometry) highlight.geometry.dispose();
				if (highlight.material) highlight.material.dispose();
			}
		}
	}
	
	// Remove pieces that are no longer in the game state
	const piecesToRemove = [];
	chessPiecesGroup.traverse(child => {
		if (child !== chessPiecesGroup && !validPieceIds.has(child.name)) {
			piecesToRemove.push(child);
		}
	});
	
	for (const piece of piecesToRemove) {
		chessPiecesGroup.remove(piece);
		
		if (piece.geometry) piece.geometry.dispose();
		if (piece.material) piece.material.dispose();
	}
}

/**
 * Create a chess piece 3D model
 * @param {string} type - Chess piece type
 * @param {number} player - Player number
 * @returns {THREE.Group} Chess piece group
 */
function createChessPiece(type, player) {
	const pieceGroup = new THREE.Group();
	const cellSize = settings.cellSize || 1;
	
	// Determine color based on player
	const color = player === 1 ? 0xFFFFFF : 0x000000;
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3
	});
	
	// Base for all pieces
	const baseGeometry = new THREE.CylinderGeometry(cellSize * 0.3, cellSize * 0.4, cellSize * 0.2, 16);
	const base = new THREE.Mesh(baseGeometry, material);
	base.position.y = cellSize * 0.1;
	pieceGroup.add(base);
	
	// Create piece based on type
	switch (type.toLowerCase()) {
		case 'pawn':
			const pawnUpperGeometry = new THREE.SphereGeometry(cellSize * 0.25, 16, 16);
			const pawnUpper = new THREE.Mesh(pawnUpperGeometry, material);
			pawnUpper.position.y = cellSize * 0.5;
			pieceGroup.add(pawnUpper);
			
			const pawnNeckGeometry = new THREE.CylinderGeometry(cellSize * 0.15, cellSize * 0.25, cellSize * 0.2, 16);
			const pawnNeck = new THREE.Mesh(pawnNeckGeometry, material);
			pawnNeck.position.y = cellSize * 0.3;
			pieceGroup.add(pawnNeck);
			break;
			
		case 'rook':
			const rookBodyGeometry = new THREE.BoxGeometry(cellSize * 0.5, cellSize * 0.5, cellSize * 0.5);
			const rookBody = new THREE.Mesh(rookBodyGeometry, material);
			rookBody.position.y = cellSize * 0.45;
			pieceGroup.add(rookBody);
			
			// Add battlements on top
			for (let i = 0; i < 4; i++) {
				const battlementGeometry = new THREE.BoxGeometry(cellSize * 0.15, cellSize * 0.2, cellSize * 0.15);
				const battlement = new THREE.Mesh(battlementGeometry, material);
				
				// Position at corners
				const offset = cellSize * 0.2;
				switch (i) {
					case 0: battlement.position.set(offset, cellSize * 0.8, offset); break;
					case 1: battlement.position.set(-offset, cellSize * 0.8, offset); break;
					case 2: battlement.position.set(offset, cellSize * 0.8, -offset); break;
					case 3: battlement.position.set(-offset, cellSize * 0.8, -offset); break;
				}
				
				pieceGroup.add(battlement);
			}
			break;
			
		case 'knight':
			// Horse head shape (simplified)
			const knightHeadGeometry = new THREE.ConeGeometry(cellSize * 0.3, cellSize * 0.6, 8);
			const knightHead = new THREE.Mesh(knightHeadGeometry, material);
			knightHead.position.y = cellSize * 0.5;
			knightHead.rotation.z = Math.PI / 6; // Tilt forward
			pieceGroup.add(knightHead);
			
			// Ears
			const earGeometry = new THREE.ConeGeometry(cellSize * 0.1, cellSize * 0.2, 8);
			const ear1 = new THREE.Mesh(earGeometry, material);
			ear1.position.set(cellSize * 0.1, cellSize * 0.7, cellSize * 0.1);
			pieceGroup.add(ear1);
			
			const ear2 = new THREE.Mesh(earGeometry, material);
			ear2.position.set(cellSize * 0.1, cellSize * 0.7, -cellSize * 0.1);
			pieceGroup.add(ear2);
			break;
			
		case 'bishop':
			// Bishop body
			const bishopBodyGeometry = new THREE.ConeGeometry(cellSize * 0.3, cellSize * 0.7, 16);
			const bishopBody = new THREE.Mesh(bishopBodyGeometry, material);
			bishopBody.position.y = cellSize * 0.45;
			pieceGroup.add(bishopBody);
			
			// Top ball
			const bishopTopGeometry = new THREE.SphereGeometry(cellSize * 0.1, 16, 16);
			const bishopTop = new THREE.Mesh(bishopTopGeometry, material);
			bishopTop.position.y = cellSize * 0.9;
			pieceGroup.add(bishopTop);
			
			// Cut on top
			const cutGeometry = new THREE.CylinderGeometry(cellSize * 0.05, cellSize * 0.05, cellSize * 0.1, 16);
			const cut = new THREE.Mesh(cutGeometry, material);
			cut.position.y = cellSize * 0.8;
			pieceGroup.add(cut);
			break;
			
		case 'queen':
			// Queen body
			const queenBodyGeometry = new THREE.CylinderGeometry(cellSize * 0.3, cellSize * 0.4, cellSize * 0.6, 16);
			const queenBody = new THREE.Mesh(queenBodyGeometry, material);
			queenBody.position.y = cellSize * 0.4;
			pieceGroup.add(queenBody);
			
			// Crown
			for (let i = 0; i < 8; i++) {
				const pointGeometry = new THREE.SphereGeometry(cellSize * 0.08, 8, 8);
				const point = new THREE.Mesh(pointGeometry, material);
				
				const angle = (i / 8) * Math.PI * 2;
				const radius = cellSize * 0.25;
				point.position.set(
					Math.cos(angle) * radius,
					cellSize * 0.8,
					Math.sin(angle) * radius
				);
				
				pieceGroup.add(point);
			}
			
			// Top ball
			const queenTopGeometry = new THREE.SphereGeometry(cellSize * 0.15, 16, 16);
			const queenTop = new THREE.Mesh(queenTopGeometry, material);
			queenTop.position.y = cellSize * 0.9;
			pieceGroup.add(queenTop);
			break;
			
		case 'king':
			// King body (similar to queen)
			const kingBodyGeometry = new THREE.CylinderGeometry(cellSize * 0.3, cellSize * 0.4, cellSize * 0.6, 16);
			const kingBody = new THREE.Mesh(kingBodyGeometry, material);
			kingBody.position.y = cellSize * 0.4;
			pieceGroup.add(kingBody);
			
			// Crown
			for (let i = 0; i < 5; i++) {
				const pointGeometry = new THREE.ConeGeometry(cellSize * 0.08, cellSize * 0.15, 8);
				const point = new THREE.Mesh(pointGeometry, material);
				
				const angle = (i / 5) * Math.PI * 2;
				const radius = cellSize * 0.25;
				point.position.set(
					Math.cos(angle) * radius,
					cellSize * 0.8,
					Math.sin(angle) * radius
				);
				
				pieceGroup.add(point);
			}
			
			// Cross on top
			const verticalGeometry = new THREE.BoxGeometry(cellSize * 0.05, cellSize * 0.3, cellSize * 0.05);
			const verticalPart = new THREE.Mesh(verticalGeometry, material);
			verticalPart.position.y = cellSize * 1.05;
			pieceGroup.add(verticalPart);
			
			const horizontalGeometry = new THREE.BoxGeometry(cellSize * 0.2, cellSize * 0.05, cellSize * 0.05);
			const horizontalPart = new THREE.Mesh(horizontalGeometry, material);
			horizontalPart.position.y = cellSize * 1.0;
			pieceGroup.add(horizontalPart);
			break;
			
		default:
			// Generic piece for unknown types
			const genericGeometry = new THREE.SphereGeometry(cellSize * 0.3, 16, 16);
			const genericPiece = new THREE.Mesh(genericGeometry, material);
			genericPiece.position.y = cellSize * 0.5;
			pieceGroup.add(genericPiece);
	}
	
	return pieceGroup;
}

/**
 * Check if the renderer is initialized
 * @returns {boolean} - Whether the renderer is initialized
 */
export function isInitialized() {
	return _isInitialized;
}

/**
 * Render a frame
 * @param {number} timestamp - Current timestamp
 * @returns {boolean} - Whether the render was successful
 */

/**
 * Update debug info for troubleshooting
 */
function updateDebugInfo() {
	try {
		// Create debug panel if it doesn't exist
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
			debugPanel.style.maxWidth = '300px';
			debugPanel.style.maxHeight = '300px';
			debugPanel.style.overflow = 'auto';
			document.body.appendChild(debugPanel);
		}
		
		// Update with renderer info only (avoid game state references)
		let info = '';
		
		// Get basic renderer info
		info += '<strong>Renderer Info</strong><br>';
		info += `Mode: ${is3DMode ? '3D' : '2D'}<br>`;
		info += `Initialized: ${_isInitialized ? 'Yes' : 'No'}<br>`;
		info += `Camera: ${camera ? 'OK' : 'Missing'}<br>`;
		
		// Check what type of controls are being used
		if (controls) {
			if (controls instanceof THREE.OrbitControls) {
				info += `Controls: OrbitControls<br>`;
			} else {
				info += `Controls: Basic<br>`;
			}
		} else {
			info += `Controls: None<br>`;
		}
		
		// FPS calculation
		info += `FPS: ${currentFps || 0}<br>`;
		
		// Display camera position if available
		if (camera) {
			info += '<strong>Camera</strong><br>';
			info += `Position X: ${camera.position.x.toFixed(2)}<br>`;
			info += `Position Y: ${camera.position.y.toFixed(2)}<br>`;
/**
 * Game Renderer Utility
 *
 * Handles rendering of game elements for both 2D and 3D modes
 */

// Set up verbose logging flag
window.VERBOSE_LOGGING = false;

// Enable/disable verbose logging
export function setVerboseLogging(enabled) {
	window.VERBOSE_LOGGING = enabled;
	console.log(`Verbose logging ${enabled ? 'enabled' : 'disabled'}`);
}

// Constants for rendering
const RENDER_MODES = {
	MODE_2D: '2d',
	MODE_3D: '3d'
};

// Default rendering settings
const DEFAULT_SETTINGS = {
	mode: RENDER_MODES.MODE_3D,
	cellSize: 40,
	boardPadding: 10,
	animationSpeed: 1.0,
	showGrid: true,
	showShadows: true,
	showGhostPiece: true,
	highlightValidMoves: true,
	theme: 'default',
	quality: 'medium'
};

// Global variables
let canvas = null;
let context = null;
let renderer = null;
let scene = null;
let camera = null;
let currentMode = null;
let _isInitialized = false;
let settings = { ...DEFAULT_SETTINGS };
let currentGameState = null;
let is3DMode = true; // Default to 3D mode
let isPaused = false;
let debugMode = true; // Set to true for debugging
let animationFrameId = null;
let lastFrameTime = performance.now(); // Use performance.now for accurate timing
let controls = null;
let isRenderLoopRunning = false;
let lastRenderTime = 0;
let lastBoardKey = null; // Cache for board state to avoid redundant updates
let lastEntitiesKey = null; // Cache for entities state

// Define loader and texture cache
let textureLoader;
const textureCache = {};

// Add variable to store animation state
let currentAnimationState = null;
let lastUpdateTime = 0;

// Import animations module
import * as animations from './animations.js';

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

// Add this near the top with other variables
let lastRendererUpdate = 0;
const MIN_RENDERER_UPDATE_INTERVAL = 100; // ms

// Note: debugMode and lastFrameTime are already declared at the top of the file

/**
 * Load a texture with error handling
 * @param {string} path - Path to texture
 * @param {Object} fallback - Fallback options if texture fails to load
 * @returns {THREE.Texture} The loaded texture or fallback
 */
function loadTexture(path, fallback = {}) {
	// Return from cache if exists
	if (textureCache[path]) {
		return textureCache[path];
	}
	
	// Create texture loader if not exists
	if (!textureLoader) {
		textureLoader = new THREE.TextureLoader();
	}
	
	// Default fallback is a colored material
	const defaultFallback = {
		color: 0x888888,
		roughness: 0.7,
		metalness: 0.3
	};
	
	const options = { ...defaultFallback, ...fallback };
	
	// Check if file exists before trying to load
	// Create a fallback immediately if the path doesn't look right
	if (!path || path.length < 5) {
		console.warn(`Invalid texture path: ${path}, using fallback`);
		return createFallbackTexture(options);
	}
	
	// Try to load texture, with error handling
	try {
		const texture = textureLoader.load(
			path,
			// Success callback
			(loadedTexture) => {
				console.log(`Texture loaded: ${path}`);
				// Store in cache
				textureCache[path] = loadedTexture;
			},
			// Progress callback (currently not used)
			undefined,
			// Error callback
			(error) => {
				console.warn(`Error loading texture ${path}:`, error);
				// Replace with fallback texture
				const fallbackTexture = createFallbackTexture(options);
				textureCache[path] = fallbackTexture;
			}
		);
		
		// Configure texture
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		
		// Cache it
		textureCache[path] = texture;
		
		return texture;
	} catch (error) {
		console.error(`Failed to load texture ${path}:`, error);
		return createFallbackTexture(options);
	}
}

/**
 * Create a fallback texture
 * @param {Object} options - Options for the fallback texture
 * @returns {THREE.Texture} Fallback texture
 */
function createFallbackTexture(options) {
	// Create a simple canvas with fallback color
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = `#${options.color.toString(16).padStart(6, '0')}`;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	const fallbackTexture = new THREE.CanvasTexture(canvas);
	return fallbackTexture;
}

// Default settings
let _container = null;
let _targetFPS = 60;
let _verbose = false; // Add verbose flag

/**
 * Set target FPS for frame limiting
 * @param {number} fps - Target frames per second (0 to disable limiting)
 */
export function setTargetFPS(fps) {
	_targetFPS = fps || 60;
	console.log(`Target FPS set to ${_targetFPS}`);
}

/**
 * Start the render loop
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
        
        // Set up frame timing variables
        let lastFrameTime = 0;
        let deltaTime = 0;
        let now = 0;
        
        // Set default frame limit if not already defined
        if (typeof _targetFPS === 'undefined') {
            _targetFPS = 60;
        }
        
        isRenderLoopRunning = true;
        
        // Render frame function
        const renderFrame = (timestamp) => {
            if (!isRenderLoopRunning) return;
            
            // Calculate delta time
            now = timestamp || performance.now();
            deltaTime = now - lastFrameTime;
            
            // Only render if enough time has passed or no frame limiting
            if (deltaTime >= frameInterval || !frameLimiterActive) {
                // Update last frame time
                lastFrameTime = now;
                
                // Update animations
                updateAnimations(now, deltaTime);
                
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
 * Stop the render loop
 */
export function stopRenderLoop() {
	if (animationFrameId !== null) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
		console.log('Render loop stopped');
	}
}

/**
 * Initialize the renderer
 * @param {HTMLElement} containerElement - Container element for the renderer
 * @param {Object} options - Renderer options
 * @returns {Promise<boolean>} - Whether initialization was successful
 */
export async function init(containerElement, options = {}) {
	try {
		if (_isInitialized) {
			console.warn('Renderer already initialized');
			return true;
		}
		
		console.log(`Initializing renderer in mode: ${options.renderMode || '3d'}`);
		
		// Store container element reference
		_container = containerElement || document.getElementById('gameContainer');
		
		// Store settings
		_verbose = options.verbose || false; // Set verbose from options
		is3DMode = options.renderMode !== '2d';
		
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
		
		// Create or get canvas
		canvas = _container.querySelector('canvas');
		if (!canvas) {
			canvas = document.createElement('canvas');
			canvas.width = window.innerWidth;
			
			// Calculate canvas height based on aspect ratio
			canvas.height = window.innerHeight;
			canvas.style.width = '100%';
			canvas.style.height = '100%';
			canvas.style.display = 'block';
			_container.appendChild(canvas);
		}
		
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
		
		try {
			_container.appendChild(canvas);
		} catch (error) {
			console.error('Failed to append canvas to container:', error);
		}
		
		// Set up event listeners
		window.addEventListener('resize', onWindowResize);
		
		// Set up OrbitControls if available
		try {
			if (typeof THREE !== 'undefined' && THREE.OrbitControls && camera) {
				console.log('Setting up OrbitControls');
				controls = new THREE.OrbitControls(camera, renderer.domElement);
				controls.enableDamping = true;
				controls.dampingFactor = 0.25;
				controls.screenSpacePanning = false;
				controls.maxPolarAngle = Math.PI / 2;
				controls.minDistance = 5;
				controls.maxDistance = 50;
				
				// Add reset button for camera
				addCameraResetButton(_container);
				
				// Add instructions for camera control
				addCameraInstructions(_container);
			} else {
				console.warn('OrbitControls not available, falling back to basic controls');
				setupBasicCameraControls(_container);
			}
		} catch (error) {
			console.warn('Error setting up OrbitControls, falling back to basic controls:', error);
			
			// If OrbitControls are not available, use basic controls
			setupBasicCameraControls(_container);
		}
		
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
 * @param {HTMLElement} container - Container element for the renderer
 * @returns {boolean} - Whether setup was successful
 */
export function setup3DScene(container) {
	try {
		console.log('Setting up 3D scene');
		
		// Create scene
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x0A1A2A); // Dark blue sky
		
		// Add fog for depth
		scene.fog = new THREE.FogExp2(0x0A1A2A, 0.03);
		
		// Create camera
		camera = new THREE.PerspectiveCamera(
			70,                                      // Field of view
			window.innerWidth / window.innerHeight,  // Aspect ratio
			0.1,                                     // Near clipping plane
			1000                                     // Far clipping plane
		);
		
		// Position camera to see the whole board
		camera.position.set(15, 20, 30);
		camera.lookAt(0, 0, 0);
		
		// Create renderer
		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.setClearColor(0x0A1A2A); // Same as scene.background
		
		// Append renderer to container
		if (container) {
			// Remove any existing canvas first
			const existingCanvas = container.querySelector('canvas');
			if (existingCanvas) {
				container.removeChild(existingCanvas);
			}
			
			// Append new renderer canvas
			container.appendChild(renderer.domElement);
		}
		
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
		
		// Setup environment
		setupEnvironment();
		
		// Add skybox
		createSkybox();
		
		// Add debug grid (temporarily)
		const gridHelper = new THREE.GridHelper(32, 32, 0x555555, 0x555555);
		gridHelper.position.y = -0.01;
		gridHelper.visible = false; // Hide grid for floating islands look
		scene.add(gridHelper);
		
		// Store reference to grid helper for later toggling
		gridHelperObj = gridHelper;
		
		console.log('3D scene setup complete');
		return true;
	} catch (error) {
		console.error('Error setting up 3D scene:', error);
		return false;
	}
}

/**
 * Handle keyboard events for camera and debug controls
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
	// Reset camera position with R key
	if (event.key === 'r' || event.key === 'R') {
		if (camera) {
			camera.position.set(15, 20, 30);
			camera.lookAt(0, 0, 0);
			if (controls) {
				controls.target.set(0, 0, 0);
				controls.update();
			}
			console.log('Camera position reset');
		}
	}
	
	// Toggle frame limiter with F key
	if (event.key === 'f' || event.key === 'F') {
		frameLimiterActive = !frameLimiterActive;
		console.log(`Frame limiting ${frameLimiterActive ? 'enabled' : 'disabled'}`);
	}
	
	// Set specific FPS values with number keys
	if (event.key >= '1' && event.key <= '9') {
		const fps = parseInt(event.key) * 10;
		setTargetFPS(fps);
	}
}

/**
 * Add on-screen instructions for camera controls
 * @param {HTMLElement} container - Container element 
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
			F: Toggle Frame Limit<br>
			1-9: Set FPS (10-90)
		`;
		
		try {
			container.appendChild(instructions);
		} catch (error) {
			console.warn('Failed to append camera instructions to container:', error);
		}
	} catch (error) {
		console.warn('Error adding camera instructions:', error);
		// Non-critical error, don't break initialization
	}
}

/**
 * Create the game board in 3D
 * @param {number} width - Board width
 * @param {number} height - Board height
 */
export function createGameBoard(width = 16, height = 16) {
	// Remove old board if it exists
	const existingBoard = scene.getObjectByName('gameBoard');
	if (existingBoard) {
		scene.remove(existingBoard);
	}
	
	// Create board container
	const boardGroup = new THREE.Group();
	boardGroup.name = 'gameBoard';
	
	// Create grid using lines for better performance
	const gridGeometry = new THREE.BufferGeometry();
	const gridMaterial = new THREE.LineBasicMaterial({ 
		color: 0x444444, 
		transparent: true,
		opacity: 0.5 
	});
	
	const gridPoints = [];
	
	// Create horizontal lines
	for (let z = 0; z <= height; z++) {
		gridPoints.push(0, 0, z);
		gridPoints.push(width, 0, z);
	}
	
	// Create vertical lines
	for (let x = 0; x <= width; x++) {
		gridPoints.push(x, 0, 0);
		gridPoints.push(x, 0, height);
	}
	
	gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
	const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
	boardGroup.add(grid);
	
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
 * Set up basic camera controls without OrbitControls
 * @param {HTMLElement} container - Container element for the renderer
 * @returns {boolean} - Whether setup was successful
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
			const rotateSpeed = 0.1;
			
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
				case 'Home':
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
 * @param {HTMLElement} container - Container element
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
		resetButton.style.fontFamily = 'Arial, sans-serif';
		resetButton.style.fontSize = '14px';
		
		// Add hover effect
		resetButton.addEventListener('mouseenter', () => {
			resetButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		});
		
		resetButton.addEventListener('mouseleave', () => {
			resetButton.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		});
		
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
		try {
			container.appendChild(resetButton);
		} catch (error) {
			console.warn('Failed to append reset button to container:', error);
		}
	} catch (error) {
		console.warn('Error adding camera reset button:', error);
		// Non-critical error, don't break initialization
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
		directionalLight.castShadow = settings.showShadows;
		
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
		
		// Add point light
		const pointLight = new THREE.PointLight(0xffffff, 0.3);
		pointLight.position.set(0, 50, 0);
		scene.add(pointLight);
		
		return true;
	} catch (error) {
		console.error('Error setting up lights:', error);
		return false;
	}
}

/**
 * Set up environment (skybox, ground, etc.)
 */
export function setupEnvironment() {
	try {
		// Add skybox
		createSkybox();
		
		// Add board decorations
		addBoardDecorations();
		
		// Add Russian-themed environmental elements
		addRussianEnvironmentElements();
		
		return true;
	} catch (error) {
		console.error('Error setting up environment:', error);
		return false;
	}
}

/**
 * Update board visualization
 * @param {Array} board - Game board data
 * @returns {boolean} - Whether update was successful
 */
export function updateBoardVisualization(board) {
	try {
		// Log board data for debugging
		console.log('Updating board visualization with data:', board);
		
		// Make sure board exists
		if (!board || !Array.isArray(board) || board.length === 0) {
			console.warn('Empty or invalid board data provided to updateBoardVisualization');
			
			// Create a debug grid if board is empty/invalid
			if (scene) {
				createGameBoard(16, 16);
				
				// Add some debug cells to visualize
				addDebugCells();
			}
			return;
		}
		
		// Get board group or create it if it doesn't exist
		let boardGroup = scene.getObjectByName('gameBoard');
		if (!boardGroup) {
			boardGroup = new THREE.Group();
			boardGroup.name = 'gameBoard';
			scene.add(boardGroup);
		}
		
		// Clear existing cells
		const existingCells = boardGroup.getObjectByName('cells');
		if (existingCells) {
			boardGroup.remove(existingCells);
		}
		
		// Create cells container
		const cellsContainer = new THREE.Group();
		cellsContainer.name = 'cells';
		boardGroup.add(cellsContainer);
		
		// Create cells based on board data
		const boardHeight = board.length;
		const boardWidth = boardHeight > 0 ? board[0].length : 0;
		
		// Update game board size if needed
		if (boardWidth > 0 && boardHeight > 0) {
			createGameBoard(boardWidth, boardHeight);
		}
		
		// Create cells for non-empty board positions
		for (let z = 0; z < boardHeight; z++) {
			if (!board[z]) continue;
			
			for (let x = 0; x < board[z].length; x++) {
				const cellValue = board[z][x];
				if (cellValue) {
					// Create cell geometry
					const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
					
					// Get appropriate material
					const material = getCellMaterial(cellValue);
					
					// Create mesh
					const cell = new THREE.Mesh(geometry, material);
					cell.position.set(x + 0.5, 0.5, z + 0.5);
					cell.userData.type = 'cell';
					cell.userData.x = x;
					cell.userData.z = z;
					cell.userData.value = cellValue;
					
					// Add cell to container
					cellsContainer.add(cell);
					
					// Add floating animation
					createFloatingAnimation(cell);
					
					console.log(`Created cell at (${x}, ${z}) with value:`, cellValue);
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
 * Add debug cells to visualize the board when there's no valid game data
 */
function addDebugCells() {
	try {
		// Get board group
		let boardGroup = scene.getObjectByName('gameBoard');
		if (!boardGroup) return;
		
		// Create cells container
		const cellsContainer = new THREE.Group();
		cellsContainer.name = 'debugCells';
		boardGroup.add(cellsContainer);
		
		// Create some cells in a pattern
		const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
		
		// Create a pattern of cells
		for (let z = 0; z < 3; z++) {
			for (let x = 0; x < 3; x++) {
				const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
				const material = new THREE.MeshStandardMaterial({
					color: colors[(z * 3 + x) % colors.length],
					roughness: 0.3,
					metalness: 0.7
				});
				
				const cell = new THREE.Mesh(geometry, material);
				cell.position.set(x * 2 + 4, 0.5, z * 2 + 4);
				cell.userData.type = 'debugCell';
				cell.userData.x = x;
				cell.userData.z = z;
				
				// Add cell to container
				cellsContainer.add(cell);
				
				// Add floating animation
				createFloatingAnimation(cell);
			}
		}
		
		console.log('Added debug cells to visualize the board');
		return true;
	} catch (error) {
		console.error('Error adding debug cells:', error);
		return false;
	}
}

/**
 * Check if a cell is connected to other cells
 * @param {Array} board - Game board
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {boolean} - Whether the cell is connected
 */
function isConnectedToOtherCells(board, x, z) {
	// Check adjacent cells (right, left, up, down)
	const directions = [
		{dx: 1, dz: 0},
		{dx: -1, dz: 0},
		{dx: 0, dz: 1},
		{dx: 0, dz: -1}
	];
	
	let connectedCount = 0;
	
	for (const dir of directions) {
		const newX = x + dir.dx;
		const newZ = z + dir.dz;
		
		// Check if the adjacent cell is within bounds and has a value
		if (board[newZ] && board[newZ][newX]) {
			connectedCount++;
		}
	}
	
	return connectedCount > 0;
}

/**
 * Update appearance of an existing cell
 * @param {THREE.Mesh} cell - Cell mesh to update
 * @param {*} cellValue - Value from the game board
 * @param {boolean} isConnected - Whether the cell is connected to others
 */
function updateCellAppearance(cell, cellValue, isConnected = false) {
	if (!cell) return;
	
	// Update material if needed
	const material = getCellMaterial(cellValue);
	cell.material.color.copy(material.color);
	
	// Add slight glow effect to enhance visibility in the dark sky
	cell.material.emissive = new THREE.Color(
		cell.material.color.r * 0.2,
		cell.material.color.g * 0.2,
		cell.material.color.b * 0.2
	);
	
	// Update floating animation parameters
	let floatingAnimation = activeAnimations.floatingCells.find(a => a.cell === cell);
	
	if (!floatingAnimation) {
		floatingAnimation = createFloatingAnimation(cell);
		activeAnimations.floatingCells.push(floatingAnimation);
	}
	
	// Connected cells float less than isolated ones to create the island effect
	floatingAnimation.amplitude = isConnected ? 0.05 : 0.15;
	
	// Update other properties based on cell type
	if (typeof cellValue === 'object' && cellValue.properties) {
		const { height, highlight } = cellValue.properties;
		
		// Apply height if specified
		if (height !== undefined) {
			cell.scale.y = height;
			cell.position.y = height * 0.5;
		}
		
		// Apply highlight if needed
		if (highlight) {
			// Add stronger emission for highlighted cells
			cell.material.emissive = new THREE.Color(
				cell.material.color.r * 0.4,
				cell.material.color.g * 0.4,
				cell.material.color.b * 0.4
			);
		}
	}
}

/**
 * Create floating animation for a cell
 * @param {THREE.Mesh} cell - Cell mesh to animate
 * @returns {Object} - Animation object
 */
function createFloatingAnimation(cell) {
	try {
		if (!cell) return null;
		
		// Store original position
		const originalY = cell.position.y;
		
		// Random offset for animation to make cells not float in sync
		const timeOffset = Math.random() * Math.PI * 2;
		
		// Random amplitude between 0.1 and 0.3
		const amplitude = 0.1 + Math.random() * 0.2;
		
		// Random period between 1 and 3 seconds
		const period = 1 + Math.random() * 2;
		
		// Random rotation amplitude
		const rotationAmplitude = Math.random() * 0.01;
		
		// Animation function
		const animate = (time, deltaTime) => {
			if (!cell) return;
			
			// Calculate wave
			const wave = Math.sin((time * 0.001 / period) + timeOffset);
			
			// Update position
			cell.position.y = originalY + wave * amplitude;
			
			// Add slight rotation to enhance floating effect
			cell.rotation.x = Math.sin(time * 0.0005) * rotationAmplitude;
			cell.rotation.z = Math.cos(time * 0.0007) * rotationAmplitude;
		};
		
		// Add to animation callbacks
		if (animationCallbacks) {
			animationCallbacks.push(animate);
		}
		
		return {
			cell,
			originalY,
			animate,
			timeOffset,
			amplitude,
			period,
			active: true
		};
	} catch (error) {
		console.error('Error creating floating animation:', error);
		return null;
	}
}

/**
 * Create a skybox with Russian theme
 */
function createSkybox() {
	// Use a gradient sky
	const vertexShader = `
		varying vec3 vWorldPosition;
		void main() {
			vec4 worldPosition = modelMatrix * vec4(position, 1.0);
			vWorldPosition = worldPosition.xyz;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`;
	
	const fragmentShader = `
		uniform vec3 topColor;
		uniform vec3 bottomColor;
		uniform float offset;
		uniform float exponent;
		varying vec3 vWorldPosition;
		void main() {
			float h = normalize(vWorldPosition + offset).y;
			gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
		}
	`;
	
	const uniforms = {
		topColor: { value: new THREE.Color(0x0077ff) },
		bottomColor: { value: new THREE.Color(0xffffff) },
		offset: { value: 33 },
		exponent: { value: 0.6 }
	};
	
	const skyGeo = new THREE.SphereGeometry(500, 32, 15);
	const skyMat = new THREE.ShaderMaterial({
		uniforms: uniforms,
		vertexShader: vertexShader,
		fragmentShader: fragmentShader,
		side: THREE.BackSide
	});
	
	const sky = new THREE.Mesh(skyGeo, skyMat);
	sky.name = 'env_sky';
	scene.add(sky);
}

/**
 * Add ornate decorations to the board edges for Russian theme
 */
function addBoardDecorations() {
	// Add decorative columns at corners
	const columnGeometry = new THREE.CylinderGeometry(0.3, 0.3, 2, 8);
	const columnMaterial = new THREE.MeshStandardMaterial({
		color: 0x8B4513,
		roughness: 0.7,
		metalness: 0.3
	});
	
	// Positions for the corner columns - adjust based on board size
	const boardWidth = 10;
	const boardHeight = 20;
	
	const cornerPositions = [
		[-0.5, 1, -0.5],  // Front left
		[boardWidth - 0.5, 1, -0.5],   // Front right
		[-0.5, 1, boardHeight - 0.5],  // Back left
		[boardWidth - 0.5, 1, boardHeight - 0.5]    // Back right
	];
	
	cornerPositions.forEach((pos, index) => {
		const column = new THREE.Mesh(columnGeometry, columnMaterial);
		
		column.position.set(pos[0], pos[1], pos[2]);
		column.castShadow = true;
		column.name = `env_column_${index}`;
		scene.add(column);
		
		// Add ornate top to each column
		const topGeometry = new THREE.SphereGeometry(0.4, 8, 8);
		const topMaterial = new THREE.MeshStandardMaterial({
			color: 0xB8860B,
			roughness: 0.5,
			metalness: 0.5
		});
		const top = new THREE.Mesh(topGeometry, topMaterial);
		top.position.set(pos[0], pos[1] + 1.1, pos[2]);
		top.castShadow = true;
		top.name = `env_columnTop_${index}`;
		scene.add(top);
	});
}

/**
 * Add Russian-themed environmental elements
 */
function addRussianEnvironmentElements() {
	try {
		// Add stylized onion dome in the distance (Russian church)
		const domeBaseGeometry = new THREE.CylinderGeometry(2, 2, 4, 16);
		const domeTopGeometry = new THREE.SphereGeometry(2, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
		const domeSpikeGeometry = new THREE.ConeGeometry(0.5, 2, 8);
		
		// Use a fallback material since the texture might not exist
		const domeMaterial = new THREE.MeshStandardMaterial({
			color: 0x4682B4, // Steel blue color
			roughness: 0.7,
			metalness: 0.3
		});
		
		const domeBase = new THREE.Mesh(domeBaseGeometry, domeMaterial);
		domeBase.position.set(-20, 5, -25);
		
		const domeTop = new THREE.Mesh(domeTopGeometry, domeMaterial);
		domeTop.position.set(-20, 9, -25);
		
		const domeSpike = new THREE.Mesh(domeSpikeGeometry, domeMaterial);
		domeSpike.position.set(-20, 11, -25);
		
		scene.add(domeBase);
		scene.add(domeTop);
		scene.add(domeSpike);
		
		// Add some smaller domes
		const colors = [0x8B0000, 0x006400, 0x4B0082, 0x000080]; // Dark red, dark green, indigo, navy
		
		for (let i = 0; i < 4; i++) {
			const smallBase = new THREE.Mesh(
				new THREE.CylinderGeometry(1, 1, 2, 16),
				new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7, metalness: 0.3 })
			);
			const smallTop = new THREE.Mesh(
				new THREE.SphereGeometry(1, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
				new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7, metalness: 0.3 })
			);
			const smallSpike = new THREE.Mesh(
				new THREE.ConeGeometry(0.25, 1, 8),
				new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.3, metalness: 0.8 }) // Gold
			);
			
			const xOffset = -15 + i * 3;
			smallBase.position.set(xOffset, 2, -23);
			smallTop.position.set(xOffset, 4, -23);
			smallSpike.position.set(xOffset, 5, -23);
			
			scene.add(smallBase);
			scene.add(smallTop);
			scene.add(smallSpike);
		}
		
		console.log('Russian environment elements added successfully');
	} catch (error) {
		console.error('Error adding Russian environment elements:', error);
		// Continue with other initialization steps even if this fails
	}
}

/**
 * Add forest of stylized Russian trees
 */
function addTreesForest() {
	// Tree geometries
	const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 5, 8);
	const leafGeometry = new THREE.ConeGeometry(2, 4, 8);
	
	// Tree materials
	const trunkMaterial = new THREE.MeshStandardMaterial({
		color: 0x8B4513,
		roughness: 0.9,
		metalness: 0.1
	});
	
	const leafMaterial = new THREE.MeshStandardMaterial({
		color: 0x228B22,
		roughness: 0.8,
		metalness: 0.1
	});
	
	// Tree positions - on both sides of the board
	const treePositions = [
		[-15, 0, -15],
		[-10, 0, -20],
		[-20, 0, -10],
		[-12, 0, -25],
		[-25, 0, -15],
		[25, 0, -15],
		[20, 0, -10],
		[15, 0, -20],
		[30, 0, -25]
	];
	
	// Create tree group
	const treeGroup = new THREE.Group();
	treeGroup.name = 'env_trees';
	
	treePositions.forEach((pos, index) => {
		// Create tree trunk
		const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
		trunk.position.set(pos[0], pos[1] + 2.5, pos[2]);
		trunk.castShadow = true;
		trunk.name = `env_treeTrunk_${index}`;
		
		// Create tree leaves
		const leaves = new THREE.Mesh(leafGeometry, leafMaterial);
		leaves.position.set(pos[0], pos[1] + 6, pos[2]);
		leaves.castShadow = true;
		leaves.name = `env_treeLeaves_${index}`;
		
		// Add to tree group
		treeGroup.add(trunk);
		treeGroup.add(leaves);
	});
	
	scene.add(treeGroup);
}

/**
 * Add distant mountains to the scene
 */
function addDistantMountains() {
	// Mountain geometry
	const mountainGeometry = new THREE.ConeGeometry(20, 30, 4);
	
	// Mountain material
	const mountainMaterial = new THREE.MeshStandardMaterial({
		color: 0x708090,
		roughness: 0.9,
		metalness: 0.1
	});
	
	// Mountain positions
	const mountainPositions = [
		[-50, -10, -100],
		[-80, -10, -100],
		[-20, -10, -100],
		[20, -10, -100],
		[60, -10, -100]
	];
	
	// Create mountain group
	const mountainGroup = new THREE.Group();
	mountainGroup.name = 'env_mountains';
	
	mountainPositions.forEach((pos, index) => {
		const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
		mountain.position.set(pos[0], pos[1], pos[2]);
		mountain.scale.set(
			0.7 + Math.random() * 0.6,
			0.7 + Math.random() * 0.6,
			0.7 + Math.random() * 0.6
		);
		mountain.rotation.y = Math.random() * Math.PI;
		mountain.castShadow = false; // Too far to cast shadows
		mountain.name = `env_mountain_${index}`;
		mountainGroup.add(mountain);
	});
	
	scene.add(mountainGroup);
}

/**
 * Add snow particle effect
 */
function addSnowEffect() {
	// Create particles
	const snowCount = 1000;
	const snowGeometry = new THREE.BufferGeometry();
	const snowVertices = [];
	
	for (let i = 0; i < snowCount; i++) {
		// Random position in a cube around the board
		const x = Math.random() * 80 - 40;
		const y = Math.random() * 50;
		const z = Math.random() * 80 - 40;
		
		snowVertices.push(x, y, z);
	}
	
	snowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(snowVertices, 3));
	
	// Snow material
	const snowMaterial = new THREE.PointsMaterial({
		color: 0xffffff,
		size: 0.3,
		transparent: true,
		opacity: 0.8
	});
	
	// Create snow particles
	const snow = new THREE.Points(snowGeometry, snowMaterial);
	snow.name = 'env_snow';
	scene.add(snow);
	
	// Animate snow
	function animateSnow() {
		// Get current positions
		const positions = snow.geometry.attributes.position.array;
		
		// Update each particle
		for (let i = 0; i < positions.length; i += 3) {
			// Move down slowly
			positions[i + 1] -= 0.05;
			
			// Add slight sideways movement
			positions[i] += Math.sin(Date.now() * 0.001 + i) * 0.01;
			
			// Reset if below ground
			if (positions[i + 1] < 0) {
				positions[i + 1] = 50;
			}
		}
		
		// Mark for update
		snow.geometry.attributes.position.needsUpdate = true;
		
		// Continue animation
		requestAnimationFrame(animateSnow);
	}
	
	// Start animation
	animateSnow();
}

/**
 * Add clouds to the sky
 */
function addClouds() {
	// Create a cloud group
	const cloudGroup = new THREE.Group();
	cloudGroup.name = 'env_clouds';
	
	// Create several cloud puffs
	const puffGeometry = new THREE.SphereGeometry(2, 8, 8);
	const cloudMaterial = new THREE.MeshStandardMaterial({
		color: 0xffffff,
		roughness: 1.0,
		metalness: 0.0,
		transparent: true,
		opacity: 0.9
	});
	
	// Create clouds at different positions
	const cloudPositions = [
		[-30, 40, -50],
		[20, 35, -60],
		[-10, 45, -40],
		[40, 50, -30],
		[-40, 55, -20]
	];
	
	cloudPositions.forEach((pos, index) => {
		const cloudPuff = new THREE.Group();
		
		// Create multiple puffs per cloud
		for (let i = 0; i < 5; i++) {
			const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
			puff.position.set(
				Math.random() * 5 - 2.5,
				Math.random() * 2 - 1,
				Math.random() * 5 - 2.5
			);
			puff.scale.set(
				0.7 + Math.random() * 0.6,
				0.7 + Math.random() * 0.6,
				0.7 + Math.random() * 0.6
			);
			cloudPuff.add(puff);
		}
		
		cloudPuff.position.set(pos[0], pos[1], pos[2]);
		cloudPuff.name = `env_cloud_${index}`;
		cloudGroup.add(cloudPuff);
	});
	
	scene.add(cloudGroup);
	
	// Animate clouds slowly
	animateClouds(cloudGroup);
}

/**
 * Animate clouds with slow movement
 */
function animateClouds(cloudGroup) {
	// Store original positions
	cloudGroup.children.forEach(cloud => {
		cloud.userData.originalX = cloud.position.x;
		cloud.userData.speed = 0.02 + Math.random() * 0.03;
		cloud.userData.amplitude = 10 + Math.random() * 20;
	});
	
	// Animation function
	function animate() {
		cloudGroup.children.forEach(cloud => {
			cloud.position.x = cloud.userData.originalX + Math.sin(Date.now() * 0.0001 * cloud.userData.speed) * cloud.userData.amplitude;
		});
		
		requestAnimationFrame(animate);
	}
	
	animate();
}

/**
 * Handle window resize
 */
function handleResize() {
	if (!canvas) return;
	
	// Update canvas size
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	
	if (currentMode === RENDER_MODES.MODE_2D) {
		// No additional setup needed for 2D
	} else if (renderer && camera) {
		// Update renderer size
		renderer.setSize(window.innerWidth, window.innerHeight);
		
		// Update camera aspect ratio
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}
}

/**
 * Set the current game state
 * @param {Object} gameState - New game state
 */
export function setGameState(gameState) {
	try {
		// Throttle updates to prevent excessive rendering
		const now = Date.now();
		if (now - lastRendererUpdate < MIN_RENDERER_UPDATE_INTERVAL) {
			// Only log in debug mode and when explicitly requested
			if (debugMode && window.VERBOSE_LOGGING) {
				console.log(`Renderer update throttled`);
			}
			return;
		}
		lastRendererUpdate = now;
		
		// Skip update if state is null
		if (!gameState) {
			return;
		}
		
		// Check if game state has actually changed in a meaningful way
		if (currentGameState) {
			const currentBoardKey = JSON.stringify(currentGameState.board || []);
			const newBoardKey = JSON.stringify(gameState.board || []);
			
			const currentTetrominoKey = JSON.stringify(currentGameState.currentTetromino || null);
			const newTetrominoKey = JSON.stringify(gameState.currentTetromino || null);
			
			const currentChessPiecesKey = JSON.stringify(currentGameState.chessPieces || []);
			const newChessPiecesKey = JSON.stringify(gameState.chessPieces || []);
			
			// If visual elements haven't changed, just update UI and return
			if (currentBoardKey === newBoardKey && 
				currentTetrominoKey === newTetrominoKey && 
				currentChessPiecesKey === newChessPiecesKey) {
				
				updateUI3D(gameState);
				currentGameState = gameState;
				return;
			}
		}
		
		// Store the new state
		currentGameState = gameState;
		
		// If in 3D mode, update the 3D rendering
		if (is3DMode && scene) {
			// Update board visualization based on the new state
			try {
				// Directly call the updateBoardVisualization function
				updateBoardVisualization(gameState.board || []);
			} catch (error) {
				console.warn('Error updating board visualization:', error);
			}
			
			// Update chess pieces and tetrominos
			try {
				updateGameEntities(gameState);
			} catch (error) {
				console.warn('Error updating game entities:', error);
			}
			
			// Update UI elements
			updateUI3D(gameState);
		}
		
		// Update game state visualization in general
		if (_isInitialized) {
			handleGameStateChange(gameState);
		}
		
		// Update turn timer
		if (gameState.turnTimeRemaining !== undefined) {
			updateTurnTimer(gameState.turnTimeRemaining);
		}
		
		// Only log in debug mode and when explicitly requested
		if (debugMode && window.VERBOSE_LOGGING) {
			console.log('UI updated based on game state');
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
 * Render in 2D mode
 */
function render2D() {
	if (!context || !canvas) {
		return;
	}
	
	// Clear canvas
	context.clearRect(0, 0, canvas.width, canvas.height);
	
	// Draw background
	context.fillStyle = '#121212';
	context.fillRect(0, 0, canvas.width, canvas.height);
	
	// If we have a game state, render it
	if (currentGameState) {
		renderBoard2D(currentGameState);
	} else {
		// Draw some debug info
		context.fillStyle = '#ffffff';
		context.font = '14px Arial';
		context.fillText('2D Renderer Active - No Game State', 10, 20);
	}
}

/**
 * Render the game board in 2D
 * @param {Object} gameState - Game state object
 */
function renderBoard2D(gameState) {
	try {
		// Calculate board size and position
		const cellSize = settings.cellSize || 30;
		const boardWidth = (gameState.board && gameState.board[0]?.length) || 10;
		const boardHeight = (gameState.board && gameState.board.length) || 20;
		const boardPixelWidth = boardWidth * cellSize;
		const boardPixelHeight = boardHeight * cellSize;
		
		// Calculate board position (centered)
		const boardX = (canvas.width - boardPixelWidth) / 2;
		const boardY = (canvas.height - boardPixelHeight) / 2;
		
		// Draw board background
		context.fillStyle = '#1a1a1a';
		context.fillRect(boardX, boardY, boardPixelWidth, boardPixelHeight);
		
		// Draw grid lines if enabled
		if (settings.showGrid) {
			context.strokeStyle = '#333333';
			context.lineWidth = 1;
			
			// Vertical grid lines
			for (let x = 0; x <= boardWidth; x++) {
				const lineX = boardX + x * cellSize;
				context.beginPath();
				context.moveTo(lineX, boardY);
				context.lineTo(lineX, boardY + boardPixelHeight);
				context.stroke();
			}
			
			// Horizontal grid lines
			for (let y = 0; y <= boardHeight; y++) {
				const lineY = boardY + y * cellSize;
				context.beginPath();
				context.moveTo(boardX, lineY);
				context.lineTo(boardX + boardPixelWidth, lineY);
				context.stroke();
			}
		}
		
		// Draw cells
		if (gameState.board) {
			for (let y = 0; y < boardHeight; y++) {
				for (let x = 0; x < boardWidth; x++) {
					const cell = gameState.board[y][x];
					if (cell) {
						const cellX = boardX + x * cellSize;
						const cellY = boardY + y * cellSize;
						
						// Draw cell
						context.fillStyle = getCellColor2D(cell);
						context.fillRect(cellX, cellY, cellSize, cellSize);
						
						// Draw cell border
						context.strokeStyle = '#000000';
						context.lineWidth = 1;
						context.strokeRect(cellX, cellY, cellSize, cellSize);
					}
				}
			}
		}
		
		// Draw ghost piece if enabled
		if (settings.showGhostPiece && gameState.currentTetromino && gameState.ghostPosition) {
			renderGhostPiece2D(
				gameState.currentTetromino.shape,
				gameState.ghostPosition,
				gameState.currentTetromino.type,
				boardX,
				boardY,
				cellSize
			);
		}
		
		// Draw current tetromino
		if (gameState.currentTetromino) {
			renderTetromino2D(gameState.currentTetromino, boardX, boardY, cellSize);
		}
		
		// Draw chess pieces
		if (gameState.chessPieces) {
			renderChessPieces2D(gameState.chessPieces, boardX, boardY, cellSize);
		}
		
		// Draw UI elements
		renderUI2D(gameState, boardX, boardY, cellSize, boardPixelWidth, boardPixelHeight);
	} catch (error) {
		console.error('Error rendering board in 2D:', error);
	}
}

/**
 * Render tetromino in 2D
 * @param {Object} tetromino - Tetromino object
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderTetromino2D(tetromino, boardX, boardY, cellSize) {
	try {
		const { shape, position, type } = tetromino;
		
		if (!shape || !position) {
			return;
		}
		
		// Draw tetromino blocks
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const worldX = position.x + x;
					const worldY = position.y + y;
					const cellX = boardX + worldX * cellSize;
					const cellY = boardY + worldY * cellSize;
					
					// Draw tetromino cell
					context.fillStyle = getTetrominoColor2D(type);
					context.fillRect(cellX, cellY, cellSize, cellSize);
					
					// Draw cell border
					context.strokeStyle = '#000000';
					context.lineWidth = 1;
					context.strokeRect(cellX, cellY, cellSize, cellSize);
				}
			}
		}
		
		// Draw height indicator
		if (position.z !== undefined && position.z > 0) {
			// Calculate center of tetromino
			let centerX = 0;
			let centerY = 0;
			let blockCount = 0;
			
			for (let y = 0; y < shape.length; y++) {
				for (let x = 0; x < shape[y].length; x++) {
					if (shape[y][x]) {
						centerX += (position.x + x);
						centerY += (position.y + y);
						blockCount++;
					}
				}
			}
			
			if (blockCount > 0) {
				centerX = boardX + (centerX / blockCount) * cellSize + cellSize / 2;
				centerY = boardY + (centerY / blockCount) * cellSize + cellSize / 2;
				
				// Draw height number
				context.fillStyle = '#ffffff';
				context.font = 'bold ' + Math.floor(cellSize * 0.8) + 'px Arial';
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				
				// Background circle for better visibility
				context.beginPath();
				context.arc(centerX, centerY, cellSize * 0.4, 0, Math.PI * 2);
				context.fillStyle = 'rgba(0, 0, 0, 0.7)';
				context.fill();
				
				// Height text
				context.fillStyle = '#ffffff';
				context.fillText(Math.ceil(position.z).toString(), centerX, centerY);
			}
		}
	} catch (error) {
		console.error('Error rendering tetromino in 2D:', error);
	}
}

/**
 * Render ghost piece in 2D
 * @param {Array} shape - Tetromino shape
 * @param {Object} position - Ghost position
 * @param {string|number} type - Tetromino type
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderGhostPiece2D(shape, position, type, boardX, boardY, cellSize) {
	try {
		if (!shape || !position) {
			return;
		}
		
		// Draw ghost tetromino blocks
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const worldX = position.x + x;
					const worldY = position.y + y;
					const cellX = boardX + worldX * cellSize;
					const cellY = boardY + worldY * cellSize;
					
					// Get tetromino color and make it transparent
					const color = getTetrominoColor2D(type);
					const colorValues = color.match(/\d+/g);
					if (colorValues && colorValues.length >= 3) {
						// Draw ghost cell (outline only)
						context.strokeStyle = `rgba(${colorValues[0]}, ${colorValues[1]}, ${colorValues[2]}, 0.5)`;
						context.lineWidth = 2;
						context.strokeRect(cellX + 2, cellY + 2, cellSize - 4, cellSize - 4);
						
						// Add pattern to ghost piece
						context.fillStyle = `rgba(${colorValues[0]}, ${colorValues[1]}, ${colorValues[2]}, 0.2)`;
						context.fillRect(cellX + 2, cellY + 2, cellSize - 4, cellSize - 4);
					}
				}
			}
		}
	} catch (error) {
		console.error('Error rendering ghost piece in 2D:', error);
	}
}

/**
 * Render chess pieces in 2D
 * @param {Array} chessPieces - Chess pieces array
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderChessPieces2D(chessPieces, boardX, boardY, cellSize) {
	try {
		for (const piece of chessPieces) {
			if (!piece || !piece.type || !piece.position) {
				continue;
			}
			
			const { type, position, player } = piece;
			const { x, y } = position;
			
			const pieceX = boardX + x * cellSize;
			const pieceY = boardY + y * cellSize;
			
			// Draw chess piece
			const pieceChar = getChessPieceChar(type, player);
			const color = player === 1 ? '#ffffff' : '#000000';
			const outline = player === 1 ? '#000000' : '#ffffff';
			
			// Draw piece
			context.font = 'bold ' + Math.floor(cellSize * 0.7) + 'px Arial';
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			
			// Draw outline for better visibility
			context.strokeStyle = outline;
			context.lineWidth = 2;
			context.strokeText(pieceChar, pieceX + cellSize / 2, pieceY + cellSize / 2);
			
			// Draw piece
			context.fillStyle = color;
			context.fillText(pieceChar, pieceX + cellSize / 2, pieceY + cellSize / 2);
		}
	} catch (error) {
		console.error('Error rendering chess pieces in 2D:', error);
	}
}

/**
 * Render UI elements in 2D
 */
function renderUI2D(gameState, boardX, boardY, cellSize, boardPixelWidth, boardPixelHeight) {
	try {
		// Draw next tetromino preview
		if (gameState.nextTetromino) {
			const previewX = boardX + boardPixelWidth + 20;
			const previewY = boardY;
			const previewSize = cellSize * 0.8;
			
			// Draw preview box
			context.fillStyle = '#1a1a1a';
			context.fillRect(previewX, previewY, previewSize * 4, previewSize * 4);
			
			// Draw label
			context.fillStyle = '#ffffff';
			context.font = '16px Arial';
			context.textAlign = 'left';
			context.textBaseline = 'top';
			context.fillText('Next:', previewX, previewY - 20);
			
			// Draw next tetromino
			const { shape, type } = gameState.nextTetromino;
			if (shape) {
				// Get tetromino dimensions
				let minX = shape[0].length;
				let minY = shape.length;
				let maxX = 0;
				let maxY = 0;
				
				for (let y = 0; y < shape.length; y++) {
					for (let x = 0; x < shape[y].length; x++) {
						if (shape[y][x]) {
							minX = Math.min(minX, x);
							minY = Math.min(minY, y);
							maxX = Math.max(maxX, x);
							maxY = Math.max(maxY, y);
						}
					}
				}
				
				const tetrominoWidth = maxX - minX + 1;
				const tetrominoHeight = maxY - minY + 1;
				
				// Center tetromino in preview box
				const offsetX = previewX + (4 - tetrominoWidth) * previewSize / 2;
				const offsetY = previewY + (4 - tetrominoHeight) * previewSize / 2;
				
				// Draw tetromino
				for (let y = 0; y < shape.length; y++) {
					for (let x = 0; x < shape[y].length; x++) {
						if (shape[y][x]) {
							const cellX = offsetX + (x - minX) * previewSize;
							const cellY = offsetY + (y - minY) * previewSize;
							
							// Draw cell
							context.fillStyle = getTetrominoColor2D(type);
							context.fillRect(cellX, cellY, previewSize, previewSize);
							
							// Draw cell border
							context.strokeStyle = '#000000';
							context.lineWidth = 1;
							context.strokeRect(cellX, cellY, previewSize, previewSize);
						}
					}
				}
			}
		}
		
		// Draw score and level
		if (gameState.score !== undefined || gameState.level !== undefined) {
			const infoX = boardX;
			const infoY = boardY + boardPixelHeight + 20;
			
			context.fillStyle = '#ffffff';
			context.font = '16px Arial';
			context.textAlign = 'left';
			context.textBaseline = 'top';
			
			if (gameState.score !== undefined) {
				context.fillText(`Score: ${gameState.score}`, infoX, infoY);
			}
			
			if (gameState.level !== undefined) {
				context.fillText(`Level: ${gameState.level}`, infoX, infoY + 25);
			}
		}
	} catch (error) {
		console.error('Error rendering UI in 2D:', error);
	}
}

/**
 * Get character for chess piece
 * @param {string} type - Piece type
 * @param {number} player - Player number
 * @returns {string} Chess piece character
 */
function getChessPieceChar(type, player) {
	const pieces = {
		'pawn': '♟',
		'knight': '♞',
		'bishop': '♝',
		'rook': '♜',
		'queen': '♛',
		'king': '♚'
	};
	
	return pieces[type.toLowerCase()] || '?';
}

/**
 * Get color for a cell in 2D
 * @param {number|string} cell - Cell value
 * @returns {string} Color as CSS color string
 */
function getCellColor2D(cell) {
	// Default colors for different cell types
	const colors = {
		1: 'rgb(0, 255, 255)', // Cyan (I)
		2: 'rgb(255, 255, 0)', // Yellow (O)
		3: 'rgb(128, 0, 128)', // Purple (T)
		4: 'rgb(0, 255, 0)',   // Green (S)
		5: 'rgb(255, 0, 0)',   // Red (Z)
		6: 'rgb(0, 0, 255)',   // Blue (J)
		7: 'rgb(255, 127, 0)', // Orange (L)
		'p1': 'rgb(50, 50, 150)', // Player 1 home zone
		'p2': 'rgb(150, 50, 50)',  // Player 2 home zone
		'wall': 'rgb(50, 50, 50)'  // Wall
	};
	
	// If cell is an object with a type property, use that
	if (typeof cell === 'object' && cell.type) {
		return colors[cell.type] || 'rgb(150, 150, 150)';
	}
	
	// Otherwise use the cell value directly
	return colors[cell] || 'rgb(150, 150, 150)';
}

/**
 * Get color for a tetromino in 2D
 * @param {number|string} type - Tetromino type
 * @returns {string} Color as CSS color string
 */
function getTetrominoColor2D(type) {
	const colors = {
		'I': 'rgb(0, 255, 255)', // Cyan
		'O': 'rgb(255, 255, 0)', // Yellow
		'T': 'rgb(128, 0, 128)', // Purple
		'S': 'rgb(0, 255, 0)',   // Green
		'Z': 'rgb(255, 0, 0)',   // Red
		'J': 'rgb(0, 0, 255)',   // Blue
		'L': 'rgb(255, 127, 0)', // Orange
		1: 'rgb(0, 255, 255)',   // Cyan (I)
		2: 'rgb(255, 255, 0)',   // Yellow (O)
		3: 'rgb(128, 0, 128)',   // Purple (T)
		4: 'rgb(0, 255, 0)',     // Green (S)
		5: 'rgb(255, 0, 0)',     // Red (Z)
		6: 'rgb(0, 0, 255)',     // Blue (J)
		7: 'rgb(255, 127, 0)'    // Orange (L)
	};
	
	return colors[type] || 'rgb(150, 150, 150)';
}

/**
 * Update all animations
 * @param {number} timestamp - Current timestamp
 * @param {number} deltaTime - Time since last frame in ms
 */
function updateAnimations(timestamp, deltaTime) {
	try {
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
		
		// Update victory/defeat animations if active
		if (victoryAnimation && victoryAnimation.update) {
			victoryAnimation.update(deltaTime);
		}
		
		if (defeatAnimation && defeatAnimation.update) {
			defeatAnimation.update(deltaTime);
		}
	} catch (error) {
		console.error('Error updating animations:', error);
	}
}

/**
 * Render in 3D mode
 * @param {number} timestamp - Current timestamp
 * @returns {boolean} - Whether the render was successful
 */
function render3D(timestamp) {
	try {
		if (!renderer || !scene || !camera) {
			console.warn('Cannot render: missing 3D components');
			return false;
		}
		
		// Calculate delta time
		const deltaTime = timestamp - (lastFrameTime || timestamp);
		lastFrameTime = timestamp;
		
		// Update controls if available
		if (controls && typeof controls.update === 'function') {
			controls.update();
		}
		
		// Render the scene
		renderer.render(scene, camera);
		
		// Update FPS counter
		frameCount++;
		framesThisSecond++;
		
		if (timestamp - lastFpsUpdate >= 1000) {
			currentFps = framesThisSecond;
			framesThisSecond = 0;
			lastFpsUpdate = timestamp;
			
			// Update debug info
			updateDebugInfo();
		}
		
		return true;
	} catch (error) {
		console.error('Error rendering in 3D:', error);
		return false;
	}
}

/**
 * Handle window resize for 3D scene
 */
function onWindowResize() {
	if (!renderer || !camera) return;
	
	// Update renderer size
	renderer.setSize(window.innerWidth, window.innerHeight);
	
	// Update camera aspect ratio
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
}

/**
 * Update UI elements based on game state
 * @param {Object} gameState - Current game state
 */
export function updateUI3D(gameState) {
	try {
		if (!gameState) return;
		
		// Update scores
		if (gameState.players) {
			updateScoreDisplay(gameState.players);
		}
		
		// Update turn indicator
		if (gameState.currentPlayer) {
			updateTurnIndicator(gameState.currentPlayer, gameState.turnPhase);
		}
		
		// Update turn timer
		if (gameState.turnTimeRemaining !== undefined) {
			updateTurnTimer(gameState.turnTimeRemaining);
		}
		
		// Only log in debug mode and when explicitly requested
		if (debugMode && window.VERBOSE_LOGGING) {
			console.log('UI updated based on game state');
		}
	} catch (error) {
		console.error('Error updating UI:', error);
	}
}

/**
 * Update score display
 * @param {Array} players - Player data
 */
export function updateScoreDisplay(players) {
	try {
		if (!players) return;
		
		// Get score elements
		const player1ScoreElement = document.getElementById('player1-score');
		const player2ScoreElement = document.getElementById('player2-score');
		
		// Update scores if elements exist
		if (player1ScoreElement && players[0]) {
			player1ScoreElement.textContent = players[0].score || 0;
		}
		
		if (player2ScoreElement && players[1]) {
			player2ScoreElement.textContent = players[1].score || 0;
		}
	} catch (error) {
		console.error('Error updating score display:', error);
	}
}

/**
 * Update turn indicator
 * @param {string} currentPlayer - Current player ID
 * @param {string} turnPhase - Current turn phase
 */
export function updateTurnIndicator(currentPlayer, turnPhase) {
	try {
		// Get turn indicator element
		const turnIndicator = document.getElementById('turn-indicator');
		if (!turnIndicator) return;
		
		// Update indicator text
		turnIndicator.textContent = `${currentPlayer}'s turn - ${turnPhase}`;
		
		// Update indicator color
		turnIndicator.className = `turn-indicator ${currentPlayer}`;
	} catch (error) {
		console.error('Error updating turn indicator:', error);
	}
}

/**
 * Update turn timer display
 * @param {number} timeRemaining - Time remaining in ms
 */
export function updateTurnTimer(timeRemaining) {
	try {
		// Get timer element
		const timerElement = document.getElementById('turn-timer');
		if (!timerElement) return;
		
		// Convert to seconds and prevent console logging
		const seconds = Math.ceil(timeRemaining / 1000);
		
		// Update timer text - this was accidentally logging to console
		timerElement.textContent = `${seconds}`;
		
		// Update timer color based on urgency
		if (seconds <= 5) {
			timerElement.className = 'turn-timer urgent';
		} else if (seconds <= 15) {
			timerElement.className = 'turn-timer warning';
		} else {
			timerElement.className = 'turn-timer';
		}
	} catch (error) {
		console.error('Error updating turn timer:', error);
	}
}

/**
 * Create row clearing animation for completed rows
 * @param {Array<number>} rowsToRemove - Array of row indices to clear
 */
export function createRowClearingAnimation(rowsToRemove) {
	if (!rowsToRemove || !rowsToRemove.length || !scene) return;
	
	// Get board width from current game state
	const boardWidth = currentGameState?.board?.[0]?.length || 10;
	
	// Create row clearing animation
	const rowAnimations = animations.createRowClearingAnimation(scene, rowsToRemove, boardWidth);
	
	console.log(`Created animation for clearing ${rowsToRemove.length} rows`);
	
	return rowAnimations;
}

/**
 * Create tetromino attachment animation
 * @param {Object} tetromino - Tetromino data
 */
export function createTetrominoAttachAnimation(tetromino) {
	if (!tetromino || !scene) return;
	
	return animations.createTetrominoAttachAnimation(scene, tetromino);
}

/**
 * Create tetromino disintegration animation
 * @param {Object} tetromino - Tetromino data
 */
export function createTetrominoDisintegrationAnimation(tetromino) {
	if (!tetromino || !scene) return;
	
	return animations.createTetrominoDisintegrationAnimation(scene, tetromino);
}

/**
 * Render scene
 * @param {number} time - Current time
 */
export function render(time) {
	if (!_isInitialized) {
		return;
	}
	
	if (is3DMode) {
		render3D(time);
	} else {
		render2D();
	}
}

/**
 * Convert screen coordinates to board coordinates
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate
 * @returns {Object|null} - Board coordinates or null if outside board
 */
export function screenToBoardCoordinates(screenX, screenY) {
	if (!camera || !scene) return null;
	
	// Create a ray from the camera to the mouse position
	const mouse = new THREE.Vector2();
	mouse.x = (screenX / window.innerWidth) * 2 - 1;
	mouse.y = -(screenY / window.innerHeight) * 2 + 1;
	
	// Create raycaster
	const raycaster = new THREE.Raycaster();
	raycaster.setFromCamera(mouse, camera);
	
	// Find the board group
	const boardGroup = scene.getObjectByName('game_board');
	if (!boardGroup) return null;
	
	// Create an invisible plane at y=0 to intersect with
	const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
	const planeMaterial = new THREE.MeshBasicMaterial({
		visible: false
	});
	const plane = new THREE.Mesh(planeGeometry, planeMaterial);
	plane.rotation.x = -Math.PI / 2; // Make horizontal
	plane.position.set(0, 0, 0);     // Place at board level
	
	// Add plane to scene temporarily
	scene.add(plane);
	
	// Cast ray and check for intersection with plane
	const intersects = raycaster.intersectObject(plane);
	
	// Remove plane from scene
	scene.remove(plane);
	plane.geometry.dispose();
	plane.material.dispose();
	
	// If no intersection, return null
	if (intersects.length === 0) return null;
	
	// Get intersection point
	const point = intersects[0].point;
	
	// Convert to board coordinates
	const x = Math.floor(point.x);
	const z = Math.floor(point.z);
	
	// Check if coordinates are within board boundaries
	const boardWidth = currentGameState?.board?.[0]?.length || 8;
	const boardHeight = currentGameState?.board?.length || 8;
	
	if (x < 0 || x >= boardWidth || z < 0 || z >= boardHeight) {
		return null;
	}
	
	return { x, z };
}

/**
 * Show victory animation
 * @param {Object} player - Player who won
 */
export function showVictoryAnimation(player) {
	// Clean up any existing animations
	hideVictoryAnimation();
	hideDefeatAnimation();
	
	// Import animations module
	import('./animations.js').then(animations => {
		// Create victory animation
		victoryAnimation = animations.createVictoryAnimation(scene, camera, player);
		
		// Add animation to the render loop
		animationCallbacks.push(() => {
			if (victoryAnimation) {
				victoryAnimation.animate();
				victoryAnimation.orbitCamera();
			}
		});
		
		console.log('Victory animation created');
	}).catch(error => {
		console.error('Error creating victory animation:', error);
	});
}

/**
 * Hide victory animation
 */
export function hideVictoryAnimation() {
	if (victoryAnimation) {
		victoryAnimation.dispose();
		victoryAnimation = null;
		
		// Reset camera
		resetCamera();
	}
}

/**
 * Show defeat animation
 */
export function showDefeatAnimation() {
	// Clean up any existing animations
	hideVictoryAnimation();
	hideDefeatAnimation();
	
	// Import animations module
	import('./animations.js').then(animations => {
		// Create defeat animation
		defeatAnimation = animations.createDefeatAnimation(scene, camera);
		
		// Add animation to the render loop
		animationCallbacks.push(() => {
			if (defeatAnimation) {
				defeatAnimation.animate();
				defeatAnimation.darkenScene();
				defeatAnimation.shakeCamera();
			}
		});
		
		console.log('Defeat animation created');
	}).catch(error => {
		console.error('Error creating defeat animation:', error);
	});
}

/**
 * Hide defeat animation
 */
export function hideDefeatAnimation() {
	if (defeatAnimation) {
		defeatAnimation.dispose();
		defeatAnimation = null;
		
		// Reset camera
		resetCamera();
	}
}

/**
 * Handle game state change
 * @param {Object} newState - New game state
 * @param {Object} oldState - Previous game state (optional)
 */
export function handleGameStateChange(newState, oldState = null) {
	// Only log in debug mode
	if (debugMode) {
		console.log('Handling game state change');
	}
	
	try {
		// Update the UI
		updateUI3D(newState);
		
		// Check for game over
		if (newState.gameOver) {
			if (newState.winner === 'player1') {
				showVictoryAnimation(1);
			} else if (newState.winner === 'player2') {
				showVictoryAnimation(2);
			} else {
				// Draw or other game over condition
				showDefeatAnimation();
			}
		}
		
		// Check for animations to play
		if (newState.animations) {
			for (const animation of newState.animations) {
				switch (animation.type) {
					case 'ROW_CLEAR':
						createRowClearingAnimation(animation.data.rows);
						break;
					case 'TETROMINO_ATTACH':
						createTetrominoAttachAnimation(animation.data.tetromino);
						break;
					case 'TETROMINO_DISINTEGRATE':
						createTetrominoDisintegrationAnimation(animation.data.tetromino);
						break;
					case 'CHESS_CAPTURE':
						// TODO: Implement chess capture animation
						break;
					case 'CHESS_CHECK':
						// TODO: Implement chess check animation
						break;
					default:
						// Unknown animation type
						if (debugMode) {
							console.warn('Unknown animation type:', animation.type);
						}
				}
			}
		}
	} catch (error) {
		console.error('Error handling game state change:', error);
	}
}

/**
 * Update the game board visualization based on game state
 * @param {Object} gameState - Game state to visualize
 */
export function updateGameBoardVisualization(gameState) {
	try {
		if (!scene || !gameState || !gameState.board) {
			return false;
		}
		
		// Create a cache key for the current board state to avoid redundant updates
		const boardKey = JSON.stringify(gameState.board);
		
		// If the board hasn't changed since last update, skip rendering
		if (boardKey === lastBoardKey) {
			return true;
		}
		
		// Store current board key for future comparison
		lastBoardKey = boardKey;
		
		// Find or create the board group
		let boardGroup = scene.getObjectByName('game_board');
		if (!boardGroup) {
			boardGroup = new THREE.Group();
			boardGroup.name = 'game_board';
			scene.add(boardGroup);
		}
		
		// Clear previous board cells
		const existingCells = [];
		boardGroup.traverse(child => {
			if (child.name && child.name.startsWith('cell_')) {
				existingCells.push(child);
			}
		});
		
		// Remove old cells that shouldn't be there anymore
		existingCells.forEach(cell => {
			boardGroup.remove(cell);
		});
		
		// Create/update cells based on game state
		const board = gameState.board;
		const cellSize = settings.cellSize || 1;
		const padding = 0.05; // Small gap between cells
		
		for (let z = 0; z < board.length; z++) {
			for (let x = 0; x < board[z].length; x++) {
				const cellValue = board[z][x];
				
				// Skip empty cells
				if (!cellValue) continue;
				
				// Create cell mesh
				const cellName = `cell_${x}_${z}`;
				let cell = boardGroup.getObjectByName(cellName);
				
				if (!cell) {
					// Create new cell geometry
					const geometry = new THREE.BoxGeometry(
						cellSize - padding * 2,
						cellSize - padding * 2,
						cellSize - padding * 2
					);
					
					// Determine material based on cell value
					const material = getCellMaterial(cellValue);
					
					// Create mesh
					cell = new THREE.Mesh(geometry, material);
					cell.name = cellName;
					cell.castShadow = true;
					cell.receiveShadow = settings.showShadows;
					
					// Add to board group
					boardGroup.add(cell);
				}
				
				// Position cell
				cell.position.set(
					x * cellSize + cellSize / 2,
					cellSize / 2, // Half height
					z * cellSize + cellSize / 2
				);
				
				// Update cell appearance if needed
				updateCellAppearance2(cell, cellValue);
			}
		}
		
		// Only log during debug
		if (debugMode) {
			console.log('Board visualization updated');
		}
		return true;
	} catch (error) {
		console.error('Error updating board visualization:', error);
		return false;
	}
}

/**
 * Get cell material based on cell value
 * @param {*} cellValue - Value from the game board
 * @returns {THREE.Material} Material for the cell
 */
function getCellMaterial(cellValue) {
	// Default colors for different cell types
	const colors = {
		1: 0x00FFFF, // Cyan (I)
		2: 0xFFFF00, // Yellow (O)
		3: 0x800080, // Purple (T)
		4: 0x00FF00, // Green (S)
		5: 0xFF0000, // Red (Z)
		6: 0x0000FF, // Blue (J)
		7: 0xFF7F00, // Orange (L)
		'p1': 0x3232FF, // Player 1 home zone
		'p2': 0xFF3232, // Player 2 home zone
		'wall': 0x323232 // Wall
	};
	
	// Determine color
	let color;
	if (typeof cellValue === 'object' && cellValue.type) {
		color = colors[cellValue.type] || 0x888888;
	} else {
		color = colors[cellValue] || 0x888888;
	}
	
	// Create material
	return new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3
	});
}

/**
 * Update appearance of an existing cell
 * @param {THREE.Mesh} cell - Cell mesh to update
 * @param {*} cellValue - Value from the game board
 */
function updateCellAppearance2(cell, cellValue) {
	if (!cell) return;
	
	// Update material if needed
	const material = getCellMaterial(cellValue);
	cell.material.color.copy(material.color);
	
	// Update other properties based on cell type
	if (typeof cellValue === 'object' && cellValue.properties) {
		const { height, floating, highlight } = cellValue.properties;
		
		// Apply height if specified
		if (height !== undefined) {
			cell.scale.y = height;
			cell.position.y = height * 0.5;
		}
		
		// Apply floating animation if needed
		if (floating) {
			// Add floating animation to activeAnimations if not already there
			if (!activeAnimations.floatingCells.find(a => a.cell === cell)) {
				const animation = createFloatingAnimation2(cell);
				activeAnimations.floatingCells.push(animation);
			}
		}
		
		// Apply highlight if needed
		if (highlight) {
			// Add emission to material
			cell.material.emissive = new THREE.Color(0x444444);
			cell.material.emissiveIntensity = 0.5;
		} else {
			// Remove emission
			cell.material.emissive = new THREE.Color(0x000000);
			cell.material.emissiveIntensity = 0;
		}
	}
}

/**
 * Create a floating animation for a cell
 * @param {THREE.Mesh} cell - Cell to animate
 * @returns {Object} Animation object
 */
function createFloatingAnimation2(cell) {
	const originalY = cell.position.y;
	const amplitude = 0.15; // Default amplitude - how high it floats
	const period = 2000 + Math.random() * 2000; // Time for one cycle in ms
	const startTime = performance.now() - Math.random() * 2000; // Random start time for varied motion
	
	return {
		cell,
		amplitude, // Can be adjusted based on whether the cell is part of an island
		originalY,
		update: function(deltaTime) {
			const time = performance.now();
			const phase = ((time - startTime) % period) / period;
			const offset = this.amplitude * Math.sin(phase * Math.PI * 2);
			cell.position.y = originalY + offset;
			
			// Add subtle rotation for more dynamic feel
			cell.rotation.x = Math.sin(phase * Math.PI * 2) * 0.01;
			cell.rotation.z = Math.cos(phase * Math.PI * 2) * 0.01;
		},
		isComplete: false
	};
}

/**
 * Update game entities based on game state
 * @param {Object} gameState - Game state to visualize
 */
export function updateGameEntities(gameState) {
	try {
		if (!scene || !gameState) {
			return false;
		}
		
		// Create cache keys for entities to avoid redundant updates
		const tetrominoKey = gameState.currentTetromino ? 
			JSON.stringify(gameState.currentTetromino) : 'null';
		const ghostKey = gameState.ghostPosition ? 
			JSON.stringify(gameState.ghostPosition) : 'null';
		const chessPiecesKey = gameState.chessPieces ? 
			JSON.stringify(gameState.chessPieces) : 'null';
			
		// Combined key for all entities
		const entitiesKey = `${tetrominoKey}|${ghostKey}|${chessPiecesKey}`;
		
		// If entities haven't changed, skip rendering
		if (entitiesKey === lastEntitiesKey) {
			return true;
		}
		
		// Store current entities key for future comparison
		lastEntitiesKey = entitiesKey;
		
		// Update tetrominos
		updateCurrentTetromino(gameState.currentTetromino);
		
		// Update ghost piece
		updateGhostPiece(gameState.currentTetromino, gameState.ghostPosition);
		
		// Update chess pieces
		updateChessPieces(gameState.chessPieces);
		
		// Only log in debug mode
		if (debugMode) {
			console.log('Game entities updated');
		}
		
		return true;
	} catch (error) {
		console.error('Error updating game entities:', error);
		return false;
	}
}

/**
 * Update current tetromino visualization
 * @param {Object} tetromino - Current tetromino data
 */
function updateCurrentTetromino(tetromino) {
	if (!scene || !tetromino) return;
	
	// Find or create tetromino group
	let tetrominoGroup = scene.getObjectByName('current_tetromino');
	if (!tetrominoGroup) {
		tetrominoGroup = new THREE.Group();
		tetrominoGroup.name = 'current_tetromino';
		scene.add(tetrominoGroup);
	}
	
	// Clear previous tetromino blocks
	while (tetrominoGroup.children.length) {
		const child = tetrominoGroup.children[0];
		tetrominoGroup.remove(child);
		
		if (child.geometry) child.geometry.dispose();
		if (child.material) child.material.dispose();
	}
	
	// Create new tetromino visualization
	const { shape, position, type } = tetromino;
	if (!shape || !position) return;
	
	const cellSize = settings.cellSize || 1;
	const padding = 0.05; // Small gap between blocks
	
	// Get tetromino color
	const colors = {
		'I': 0x00FFFF, // Cyan
		'O': 0xFFFF00, // Yellow
		'T': 0x800080, // Purple
		'S': 0x00FF00, // Green
		'Z': 0xFF0000, // Red
		'J': 0x0000FF, // Blue
		'L': 0xFF7F00, // Orange
		1: 0x00FFFF, // Cyan (I)
		2: 0xFFFF00, // Yellow (O)
		3: 0x800080, // Purple (T)
		4: 0x00FF00, // Green (S)
		5: 0xFF0000, // Red (Z)
		6: 0x0000FF, // Blue (J)
		7: 0xFF7F00  // Orange (L)
	};
	
	const color = colors[type] || 0x888888;
	
	// Create block geometry
	const geometry = new THREE.BoxGeometry(
		cellSize - padding * 2,
		cellSize - padding * 2,
		cellSize - padding * 2
	);
	
	// Create material with slight emission for active piece
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.2 // Subtle glow
	});
	
	// Create blocks for each cell in the shape
	for (let y = 0; y < shape.length; y++) {
		for (let x = 0; x < shape[y].length; x++) {
			if (shape[y][x]) {
				const block = new THREE.Mesh(geometry, material);
				
				// Position the block
				block.position.set(
					(position.x + x) * cellSize + cellSize / 2,
					(position.z || 0) * cellSize + cellSize / 2, // Height if defined
					(position.y + y) * cellSize + cellSize / 2
				);
				
				block.castShadow = true;
				block.receiveShadow = settings.showShadows;
				
				tetrominoGroup.add(block);
			}
		}
	}
}

/**
 * Update ghost piece visualization
 * @param {Object} tetromino - Current tetromino data
 * @param {Object} ghostPosition - Ghost piece position
 */
function updateGhostPiece(tetromino, ghostPosition) {
	if (!scene || !tetromino || !ghostPosition || !settings.showGhostPiece) return;
	
	// Find or create ghost piece group
	let ghostGroup = scene.getObjectByName('ghost_piece');
	if (!ghostGroup) {
		ghostGroup = new THREE.Group();
		ghostGroup.name = 'ghost_piece';
		scene.add(ghostGroup);
	}
	
	// Clear previous ghost blocks
	while (ghostGroup.children.length) {
		const child = ghostGroup.children[0];
		ghostGroup.remove(child);
		
		if (child.geometry) child.geometry.dispose();
		if (child.material) child.material.dispose();
	}
	
	// Create new ghost visualization
	const { shape, type } = tetromino;
	if (!shape) return;
	
	const cellSize = settings.cellSize || 1;
	const padding = 0.1; // Larger gap for ghost piece
	
	// Get tetromino color but make it transparent
	const colors = {
		'I': 0x00FFFF, // Cyan
		'O': 0xFFFF00, // Yellow
		'T': 0x800080, // Purple
		'S': 0x00FF00, // Green
		'Z': 0xFF0000, // Red
		'J': 0x0000FF, // Blue
		'L': 0xFF7F00, // Orange
		1: 0x00FFFF, // Cyan (I)
		2: 0xFFFF00, // Yellow (O)
		3: 0x800080, // Purple (T)
		4: 0x00FF00, // Green (S)
		5: 0xFF0000, // Red (Z)
		6: 0x0000FF, // Blue (J)
		7: 0xFF7F00  // Orange (L)
	};
	
	const color = colors[type] || 0x888888;
	
	// Create transparent material for ghost
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3,
		transparent: true,
		opacity: 0.3,
		wireframe: true
	});
	
	// Create blocks for each cell in the shape
	for (let y = 0; y < shape.length; y++) {
		for (let x = 0; x < shape[y].length; x++) {
			if (shape[y][x]) {
				// Use wireframe box for ghost piece
				const geometry = new THREE.BoxGeometry(
					cellSize - padding * 2,
					cellSize - padding * 2,
					cellSize - padding * 2
				);
				
				const block = new THREE.Mesh(geometry, material);
				
				// Position the block
				block.position.set(
					(ghostPosition.x + x) * cellSize + cellSize / 2,
					(ghostPosition.z || 0) * cellSize + cellSize / 2, // Height if defined
					(ghostPosition.y + y) * cellSize + cellSize / 2
				);
				
				block.castShadow = false;
				block.receiveShadow = false;
				
				ghostGroup.add(block);
			}
		}
	}
}

/**
 * Update chess pieces visualization
 * @param {Array} chessPieces - Array of chess pieces
 */
function updateChessPieces(chessPieces) {
	if (!scene) return;
	
	// Find or create chess pieces group
	let chessPiecesGroup = scene.getObjectByName('chess_pieces');
	if (!chessPiecesGroup) {
		chessPiecesGroup = new THREE.Group();
		chessPiecesGroup.name = 'chess_pieces';
		scene.add(chessPiecesGroup);
	}
	
	// If no chess pieces, clear the group and return
	if (!chessPieces || chessPieces.length === 0) {
		while (chessPiecesGroup.children.length) {
			const child = chessPiecesGroup.children[0];
			chessPiecesGroup.remove(child);
			
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
		return;
	}
	
	// Track which pieces are still valid
	const validPieceIds = new Set();
	
	// Update or create chess pieces
	for (const piece of chessPieces) {
		if (!piece || !piece.type || !piece.position) continue;
		
		const { id, type, position, player } = piece;
		const pieceId = id || `${type}_${player}_${position.x}_${position.y}`;
		validPieceIds.add(pieceId);
		
		// Find existing piece or create new one
		let chessPiece = chessPiecesGroup.getObjectByName(pieceId);
		
		if (!chessPiece) {
			// Create new chess piece
			chessPiece = createChessPiece(type, player);
			chessPiece.name = pieceId;
			chessPiecesGroup.add(chessPiece);
		}
		
		// Position the piece
		const cellSize = settings.cellSize || 1;
		chessPiece.position.set(
			position.x * cellSize + cellSize / 2,
			(position.height || 0) * cellSize + cellSize, // Slightly elevated
			position.y * cellSize + cellSize / 2
		);
		
		// Add highlight if piece is selected
		if (piece.selected) {
			// Create or update highlight
			let highlight = chessPiece.getObjectByName('highlight');
			if (!highlight) {
				const geometry = new THREE.RingGeometry(cellSize * 0.6, cellSize * 0.8, 16);
				const material = new THREE.MeshBasicMaterial({
					color: 0xFFFF00,
					transparent: true,
					opacity: 0.7,
					side: THREE.DoubleSide
				});
				
				highlight = new THREE.Mesh(geometry, material);
				highlight.name = 'highlight';
				highlight.rotation.x = -Math.PI / 2; // Lay flat
				highlight.position.y = 0.1; // Just above the ground
				
				chessPiece.add(highlight);
			}
		} else {
			// Remove highlight if not selected
			const highlight = chessPiece.getObjectByName('highlight');
			if (highlight) {
				chessPiece.remove(highlight);
				
				if (highlight.geometry) highlight.geometry.dispose();
				if (highlight.material) highlight.material.dispose();
			}
		}
	}
	
	// Remove pieces that are no longer in the game state
	const piecesToRemove = [];
	chessPiecesGroup.traverse(child => {
		if (child !== chessPiecesGroup && !validPieceIds.has(child.name)) {
			piecesToRemove.push(child);
		}
	});
	
	for (const piece of piecesToRemove) {
		chessPiecesGroup.remove(piece);
		
		if (piece.geometry) piece.geometry.dispose();
		if (piece.material) piece.material.dispose();
	}
}

/**
 * Create a chess piece 3D model
 * @param {string} type - Chess piece type
 * @param {number} player - Player number
 * @returns {THREE.Group} Chess piece group
 */
function createChessPiece(type, player) {
	const pieceGroup = new THREE.Group();
	const cellSize = settings.cellSize || 1;
	
	// Determine color based on player
	const color = player === 1 ? 0xFFFFFF : 0x000000;
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3
	});
	
	// Base for all pieces
	const baseGeometry = new THREE.CylinderGeometry(cellSize * 0.3, cellSize * 0.4, cellSize * 0.2, 16);
	const base = new THREE.Mesh(baseGeometry, material);
	base.position.y = cellSize * 0.1;
	pieceGroup.add(base);
	
	// Create piece based on type
	switch (type.toLowerCase()) {
		case 'pawn':
			const pawnUpperGeometry = new THREE.SphereGeometry(cellSize * 0.25, 16, 16);
			const pawnUpper = new THREE.Mesh(pawnUpperGeometry, material);
			pawnUpper.position.y = cellSize * 0.5;
			pieceGroup.add(pawnUpper);
			
			const pawnNeckGeometry = new THREE.CylinderGeometry(cellSize * 0.15, cellSize * 0.25, cellSize * 0.2, 16);
			const pawnNeck = new THREE.Mesh(pawnNeckGeometry, material);
			pawnNeck.position.y = cellSize * 0.3;
			pieceGroup.add(pawnNeck);
			break;
			
		case 'rook':
			const rookBodyGeometry = new THREE.BoxGeometry(cellSize * 0.5, cellSize * 0.5, cellSize * 0.5);
			const rookBody = new THREE.Mesh(rookBodyGeometry, material);
			rookBody.position.y = cellSize * 0.45;
			pieceGroup.add(rookBody);
			
			// Add battlements on top
			for (let i = 0; i < 4; i++) {
				const battlementGeometry = new THREE.BoxGeometry(cellSize * 0.15, cellSize * 0.2, cellSize * 0.15);
				const battlement = new THREE.Mesh(battlementGeometry, material);
				
				// Position at corners
				const offset = cellSize * 0.2;
				switch (i) {
					case 0: battlement.position.set(offset, cellSize * 0.8, offset); break;
					case 1: battlement.position.set(-offset, cellSize * 0.8, offset); break;
					case 2: battlement.position.set(offset, cellSize * 0.8, -offset); break;
					case 3: battlement.position.set(-offset, cellSize * 0.8, -offset); break;
				}
				
				pieceGroup.add(battlement);
			}
			break;
			
		case 'knight':
			// Horse head shape (simplified)
			const knightHeadGeometry = new THREE.ConeGeometry(cellSize * 0.3, cellSize * 0.6, 8);
			const knightHead = new THREE.Mesh(knightHeadGeometry, material);
			knightHead.position.y = cellSize * 0.5;
			knightHead.rotation.z = Math.PI / 6; // Tilt forward
			pieceGroup.add(knightHead);
			
			// Ears
			const earGeometry = new THREE.ConeGeometry(cellSize * 0.1, cellSize * 0.2, 8);
			const ear1 = new THREE.Mesh(earGeometry, material);
			ear1.position.set(cellSize * 0.1, cellSize * 0.7, cellSize * 0.1);
			pieceGroup.add(ear1);
			
			const ear2 = new THREE.Mesh(earGeometry, material);
			ear2.position.set(cellSize * 0.1, cellSize * 0.7, -cellSize * 0.1);
			pieceGroup.add(ear2);
			break;
			
		case 'bishop':
			// Bishop body
			const bishopBodyGeometry = new THREE.ConeGeometry(cellSize * 0.3, cellSize * 0.7, 16);
			const bishopBody = new THREE.Mesh(bishopBodyGeometry, material);
			bishopBody.position.y = cellSize * 0.45;
			pieceGroup.add(bishopBody);
			
			// Top ball
			const bishopTopGeometry = new THREE.SphereGeometry(cellSize * 0.1, 16, 16);
			const bishopTop = new THREE.Mesh(bishopTopGeometry, material);
			bishopTop.position.y = cellSize * 0.9;
			pieceGroup.add(bishopTop);
			
			// Cut on top
			const cutGeometry = new THREE.CylinderGeometry(cellSize * 0.05, cellSize * 0.05, cellSize * 0.1, 16);
			const cut = new THREE.Mesh(cutGeometry, material);
			cut.position.y = cellSize * 0.8;
			pieceGroup.add(cut);
			break;
			
		case 'queen':
			// Queen body
			const queenBodyGeometry = new THREE.CylinderGeometry(cellSize * 0.3, cellSize * 0.4, cellSize * 0.6, 16);
			const queenBody = new THREE.Mesh(queenBodyGeometry, material);
			queenBody.position.y = cellSize * 0.4;
			pieceGroup.add(queenBody);
			
			// Crown
			for (let i = 0; i < 8; i++) {
				const pointGeometry = new THREE.SphereGeometry(cellSize * 0.08, 8, 8);
				const point = new THREE.Mesh(pointGeometry, material);
				
				const angle = (i / 8) * Math.PI * 2;
				const radius = cellSize * 0.25;
				point.position.set(
					Math.cos(angle) * radius,
					cellSize * 0.8,
					Math.sin(angle) * radius
				);
				
				pieceGroup.add(point);
			}
			
			// Top ball
			const queenTopGeometry = new THREE.SphereGeometry(cellSize * 0.15, 16, 16);
			const queenTop = new THREE.Mesh(queenTopGeometry, material);
			queenTop.position.y = cellSize * 0.9;
			pieceGroup.add(queenTop);
			break;
			
		case 'king':
			// King body (similar to queen)
			const kingBodyGeometry = new THREE.CylinderGeometry(cellSize * 0.3, cellSize * 0.4, cellSize * 0.6, 16);
			const kingBody = new THREE.Mesh(kingBodyGeometry, material);
			kingBody.position.y = cellSize * 0.4;
			pieceGroup.add(kingBody);
			
			// Crown
			for (let i = 0; i < 5; i++) {
				const pointGeometry = new THREE.ConeGeometry(cellSize * 0.08, cellSize * 0.15, 8);
				const point = new THREE.Mesh(pointGeometry, material);
				
				const angle = (i / 5) * Math.PI * 2;
				const radius = cellSize * 0.25;
				point.position.set(
					Math.cos(angle) * radius,
					cellSize * 0.8,
					Math.sin(angle) * radius
				);
				
				pieceGroup.add(point);
			}
			
			// Cross on top
			const verticalGeometry = new THREE.BoxGeometry(cellSize * 0.05, cellSize * 0.3, cellSize * 0.05);
			const verticalPart = new THREE.Mesh(verticalGeometry, material);
			verticalPart.position.y = cellSize * 1.05;
			pieceGroup.add(verticalPart);
			
			const horizontalGeometry = new THREE.BoxGeometry(cellSize * 0.2, cellSize * 0.05, cellSize * 0.05);
			const horizontalPart = new THREE.Mesh(horizontalGeometry, material);
			horizontalPart.position.y = cellSize * 1.0;
			pieceGroup.add(horizontalPart);
			break;
			
		default:
			// Generic piece for unknown types
			const genericGeometry = new THREE.SphereGeometry(cellSize * 0.3, 16, 16);
			const genericPiece = new THREE.Mesh(genericGeometry, material);
			genericPiece.position.y = cellSize * 0.5;
			pieceGroup.add(genericPiece);
	}
	
	return pieceGroup;
}

/**
 * Check if the renderer is initialized
 * @returns {boolean} - Whether the renderer is initialized
 */
export function isInitialized() {
	return _isInitialized;
}

/**
 * Render a frame
 * @param {number} timestamp - Current timestamp
 * @returns {boolean} - Whether the render was successful
 */

/**
 * Update debug info for troubleshooting
 */
function updateDebugInfo() {
	try {
		// Create debug panel if it doesn't exist
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
			debugPanel.style.maxWidth = '300px';
			debugPanel.style.maxHeight = '300px';
			debugPanel.style.overflow = 'auto';
			document.body.appendChild(debugPanel);
		}
		
		// Update with current game state info
		let info = '';
		
		// Get basic renderer info
		info += '<strong>Renderer Info</strong><br>';
		info += `Mode: ${is3DMode ? '3D' : '2D'}<br>`;
		info += `Initialized: ${_isInitialized ? 'Yes' : 'No'}<br>`;
		info += `Camera: ${camera ? 'OK' : 'Missing'}<br>`;
		
		// Check what type of controls are being used
		if (controls) {
			if (controls instanceof THREE.OrbitControls) {
				info += `Controls: OrbitControls<br>`;
			} else {
				info += `Controls: Basic<br>`;
			}
		} else {
			info += `Controls: Missing<br>`;
		}
		
		// FPS calculation
		info += `FPS: ${currentFps || 0}<br>`;
		
		// Display camera position if available
		if (camera) {
			info += '<strong>Camera</strong><br>';
			info += `Position X: ${camera.position.x.toFixed(2)}<br>`;
			info += `Position Y: ${camera.position.y.toFixed(2)}<br>`;
			info += `Position Z: ${camera.position.z.toFixed(2)}<br>`;
		}
		
		// Update the debug panel
		debugPanel.innerHTML = info;
	} catch (error) {
		console.error('Error updating debug info:', error);
	}
}




/**
 * Game Renderer Utility
 *
 * Handles rendering of game elements for both 2D and 3D modes
 */

// Set up verbose logging flag
window.VERBOSE_LOGGING = false;

// Enable/disable verbose logging
export function setVerboseLogging(enabled) {
	window.VERBOSE_LOGGING = enabled;
	console.log(`Verbose logging ${enabled ? 'enabled' : 'disabled'}`);
}

// Constants for rendering
const RENDER_MODES = {
	MODE_2D: '2d',
	MODE_3D: '3d'
};

// Default rendering settings
const DEFAULT_SETTINGS = {
	mode: RENDER_MODES.MODE_3D,
	cellSize: 40,
	boardPadding: 10,
	animationSpeed: 1.0,
	showGrid: true,
	showShadows: true,
	showGhostPiece: true,
	highlightValidMoves: true,
	theme: 'default',
	quality: 'medium'
};

// Global variables
let canvas = null;
let context = null;
let renderer = null;
let scene = null;
let camera = null;
let currentMode = null;
let _isInitialized = false;
let settings = { ...DEFAULT_SETTINGS };
let currentGameState = null;
let is3DMode = true; // Default to 3D mode
let isPaused = false;
let debugMode = true; // Set to true for debugging
let animationFrameId = null;
let lastFrameTime = performance.now(); // Use performance.now for accurate timing
let controls = null;
let isRenderLoopRunning = false;
let lastRenderTime = 0;
let lastBoardKey = null; // Cache for board state to avoid redundant updates
let lastEntitiesKey = null; // Cache for entities state

// Define loader and texture cache
let textureLoader;
const textureCache = {};

// Add variable to store animation state
let currentAnimationState = null;
let lastUpdateTime = 0;

// Import animations module
import * as animations from './animations.js';

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

// Add this near the top with other variables
let lastRendererUpdate = 0;
const MIN_RENDERER_UPDATE_INTERVAL = 100; // ms

// Note: debugMode and lastFrameTime are already declared at the top of the file

/**
 * Load a texture with error handling
 * @param {string} path - Path to texture
 * @param {Object} fallback - Fallback options if texture fails to load
 * @returns {THREE.Texture} The loaded texture or fallback
 */
function loadTexture(path, fallback = {}) {
	// Return from cache if exists
	if (textureCache[path]) {
		return textureCache[path];
	}
	
	// Create texture loader if not exists
	if (!textureLoader) {
		textureLoader = new THREE.TextureLoader();
	}
	
	// Default fallback is a colored material
	const defaultFallback = {
		color: 0x888888,
		roughness: 0.7,
		metalness: 0.3
	};
	
	const options = { ...defaultFallback, ...fallback };
	
	// Check if file exists before trying to load
	// Create a fallback immediately if the path doesn't look right
	if (!path || path.length < 5) {
		console.warn(`Invalid texture path: ${path}, using fallback`);
		return createFallbackTexture(options);
	}
	
	// Try to load texture, with error handling
	try {
		const texture = textureLoader.load(
			path,
			// Success callback
			(loadedTexture) => {
				console.log(`Texture loaded: ${path}`);
				// Store in cache
				textureCache[path] = loadedTexture;
			},
			// Progress callback (currently not used)
			undefined,
			// Error callback
			(error) => {
				console.warn(`Error loading texture ${path}:`, error);
				// Replace with fallback texture
				const fallbackTexture = createFallbackTexture(options);
				textureCache[path] = fallbackTexture;
			}
		);
		
		// Configure texture
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		
		// Cache it
		textureCache[path] = texture;
		
		return texture;
	} catch (error) {
		console.error(`Failed to load texture ${path}:`, error);
		return createFallbackTexture(options);
	}
}

/**
 * Create a fallback texture
 * @param {Object} options - Options for the fallback texture
 * @returns {THREE.Texture} Fallback texture
 */
function createFallbackTexture(options) {
	// Create a simple canvas with fallback color
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 128;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = `#${options.color.toString(16).padStart(6, '0')}`;
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	const fallbackTexture = new THREE.CanvasTexture(canvas);
	return fallbackTexture;
}

// Default settings
let _container = null;
let _targetFPS = 60;

/**
 * Set target FPS for frame limiting
 * @param {number} fps - Target frames per second (0 to disable limiting)
 */
export function setTargetFPS(fps) {
	_targetFPS = fps || 60;
	console.log(`Target FPS set to ${_targetFPS}`);
}

/**
 * Start the render loop
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
        
        // Set up frame timing variables
        let lastFrameTime = 0;
        let deltaTime = 0;
        let now = 0;
        
        // Set default frame limit if not already defined
        if (typeof _targetFPS === 'undefined') {
            _targetFPS = 60;
        }
        
        isRenderLoopRunning = true;
        
        // Render frame function
        const renderFrame = (timestamp) => {
            if (!isRenderLoopRunning) return;
            
            // Calculate delta time
            now = timestamp || performance.now();
            deltaTime = now - lastFrameTime;
            
            // Only render if enough time has passed or no frame limiting
            if (deltaTime >= frameInterval || !frameLimiterActive) {
                // Update last frame time
                lastFrameTime = now;
                
                // Update animations
                updateAnimations(now, deltaTime);
                
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
 * Stop the render loop
 */
export function stopRenderLoop() {
	if (animationFrameId !== null) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
		console.log('Render loop stopped');
	}
}

/**
 * Initialize the renderer
 * @param {HTMLElement} containerElement - Container element for the renderer
 * @param {Object} options - Renderer options
 * @returns {Promise<boolean>} - Whether initialization was successful
 */
export async function init(containerElement, options = {}) {
	try {
		if (_isInitialized) {
			console.warn('Renderer already initialized');
			return true;
		}
		
		console.log(`Initializing renderer in mode: ${options.renderMode || '3d'}`);
		
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
		
		// Store settings
		is3DMode = options.renderMode !== '2d';
		verbose = options.verbose || false;
		
		// Set up performance monitoring
		lastFrameTime = performance.now();
		frameCount = 0;
		framesThisSecond = 0;
		lastFpsUpdate = performance.now();
		currentFps = 0;
		
		// Create or get canvas
		canvas = _container.querySelector('canvas');
		if (!canvas) {
			canvas = document.createElement('canvas');
			canvas.width = window.innerWidth;
			
			// Calculate canvas height based on aspect ratio
			canvas.height = window.innerHeight;
			canvas.style.width = '100%';
			canvas.style.height = '100%';
			canvas.style.display = 'block';
			_container.appendChild(canvas);
		}
		
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
		
		try {
			_container.appendChild(canvas);
		} catch (error) {
			console.error('Failed to append canvas to container:', error);
		}
		
		// Set up event listeners
		window.addEventListener('resize', onWindowResize);
		
		// Set up OrbitControls if available
		try {
			if (typeof THREE !== 'undefined' && THREE.OrbitControls && camera) {
				console.log('Setting up OrbitControls');
				controls = new THREE.OrbitControls(camera, renderer.domElement);
				controls.enableDamping = true;
				controls.dampingFactor = 0.25;
				controls.screenSpacePanning = false;
				controls.maxPolarAngle = Math.PI / 2;
				controls.minDistance = 5;
				controls.maxDistance = 50;
				
				// Add reset button for camera
				addCameraResetButton(_container);
				
				// Add instructions for camera control
				addCameraInstructions(_container);
			} else {
				console.warn('OrbitControls not available, falling back to basic controls');
				setupBasicCameraControls(_container);
			}
		} catch (error) {
			console.warn('Error setting up OrbitControls, falling back to basic controls:', error);
			
			// If OrbitControls are not available, use basic controls
			setupBasicCameraControls(_container);
		}
		
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
 * @param {HTMLElement} container - Container element for the renderer
 * @returns {boolean} - Whether setup was successful
 */
export function setup3DScene(container) {
	try {
		console.log('Setting up 3D scene');
		
		// Create scene
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x0A1A2A); // Dark blue sky
		
		// Add fog for depth
		scene.fog = new THREE.FogExp2(0x0A1A2A, 0.03);
		
		// Create camera
		camera = new THREE.PerspectiveCamera(
			70,                                      // Field of view
			window.innerWidth / window.innerHeight,  // Aspect ratio
			0.1,                                     // Near clipping plane
			1000                                     // Far clipping plane
		);
		
		// Position camera to see the whole board
		camera.position.set(15, 20, 30);
		camera.lookAt(0, 0, 0);
		
		// Create renderer
		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.setClearColor(0x0A1A2A); // Same as scene.background
		
		// Append renderer to container
		if (container) {
			// Remove any existing canvas first
			const existingCanvas = container.querySelector('canvas');
			if (existingCanvas) {
				container.removeChild(existingCanvas);
			}
			
			// Append new renderer canvas
			container.appendChild(renderer.domElement);
		}
		
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
		
		// Setup environment
		setupEnvironment();
		
		// Add skybox
		createSkybox();
		
		// Add debug grid (temporarily)
		const gridHelper = new THREE.GridHelper(32, 32, 0x555555, 0x555555);
		gridHelper.position.y = -0.01;
		gridHelper.visible = false; // Hide grid for floating islands look
		scene.add(gridHelper);
		
		// Store reference to grid helper for later toggling
		gridHelperObj = gridHelper;
		
		console.log('3D scene setup complete');
		return true;
	} catch (error) {
		console.error('Error setting up 3D scene:', error);
		return false;
	}
}

/**
 * Handle keyboard events for camera and debug controls
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
	// Reset camera position with R key
	if (event.key === 'r' || event.key === 'R') {
		if (camera) {
			camera.position.set(15, 20, 30);
			camera.lookAt(0, 0, 0);
			if (controls) {
				controls.target.set(0, 0, 0);
				controls.update();
			}
			console.log('Camera position reset');
		}
	}
	
	// Toggle frame limiter with F key
	if (event.key === 'f' || event.key === 'F') {
		frameLimiterActive = !frameLimiterActive;
		console.log(`Frame limiting ${frameLimiterActive ? 'enabled' : 'disabled'}`);
	}
	
	// Set specific FPS values with number keys
	if (event.key >= '1' && event.key <= '9') {
		const fps = parseInt(event.key) * 10;
		setTargetFPS(fps);
	}
}

/**
 * Add on-screen instructions for camera controls
 * @param {HTMLElement} container - Container element 
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
			F: Toggle Frame Limit<br>
			1-9: Set FPS (10-90)
		`;
		
		try {
			container.appendChild(instructions);
		} catch (error) {
			console.warn('Failed to append camera instructions to container:', error);
		}
	} catch (error) {
		console.warn('Error adding camera instructions:', error);
		// Non-critical error, don't break initialization
	}
}

/**
 * Create the game board in 3D
 * @param {number} width - Board width
 * @param {number} height - Board height
 */
export function createGameBoard(width = 16, height = 16) {
	// Remove old board if it exists
	const existingBoard = scene.getObjectByName('gameBoard');
	if (existingBoard) {
		scene.remove(existingBoard);
	}
	
	// Create board container
	const boardGroup = new THREE.Group();
	boardGroup.name = 'gameBoard';
	
	// Create grid using lines for better performance
	const gridGeometry = new THREE.BufferGeometry();
	const gridMaterial = new THREE.LineBasicMaterial({ 
		color: 0x444444, 
		transparent: true,
		opacity: 0.5 
	});
	
	const gridPoints = [];
	
	// Create horizontal lines
	for (let z = 0; z <= height; z++) {
		gridPoints.push(0, 0, z);
		gridPoints.push(width, 0, z);
	}
	
	// Create vertical lines
	for (let x = 0; x <= width; x++) {
		gridPoints.push(x, 0, 0);
		gridPoints.push(x, 0, height);
	}
	
	gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
	const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
	boardGroup.add(grid);
	
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
 * Set up basic camera controls without OrbitControls
 * @param {HTMLElement} container - Container element for the renderer
 * @returns {boolean} - Whether setup was successful
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
			const rotateSpeed = 0.1;
			
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
				case 'Home':
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
 * @param {HTMLElement} container - Container element
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
		resetButton.style.fontFamily = 'Arial, sans-serif';
		resetButton.style.fontSize = '14px';
		
		// Add hover effect
		resetButton.addEventListener('mouseenter', () => {
			resetButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		});
		
		resetButton.addEventListener('mouseleave', () => {
			resetButton.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		});
		
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
		try {
			container.appendChild(resetButton);
		} catch (error) {
			console.warn('Failed to append reset button to container:', error);
		}
	} catch (error) {
		console.warn('Error adding camera reset button:', error);
		// Non-critical error, don't break initialization
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
		directionalLight.castShadow = settings.showShadows;
		
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
		
		// Add point light
		const pointLight = new THREE.PointLight(0xffffff, 0.3);
		pointLight.position.set(0, 50, 0);
		scene.add(pointLight);
		
		return true;
	} catch (error) {
		console.error('Error setting up lights:', error);
		return false;
	}
}

/**
 * Set up environment (skybox, ground, etc.)
 */
export function setupEnvironment() {
	try {
		// Add skybox
		createSkybox();
		
		// Add board decorations
		addBoardDecorations();
		
		// Add Russian-themed environmental elements
		addRussianEnvironmentElements();
		
		return true;
	} catch (error) {
		console.error('Error setting up environment:', error);
		return false;
	}
}

/**
 * Update board visualization
 * @param {Array} board - Game board data
 * @returns {boolean} - Whether update was successful
 */
export function updateBoardVisualization(board) {
	try {
		// Log board data for debugging
		console.log('Updating board visualization with data:', board);
		
		// Make sure board exists
		if (!board || !Array.isArray(board) || board.length === 0) {
			console.warn('Empty or invalid board data provided to updateBoardVisualization');
			
			// Create a debug grid if board is empty/invalid
			if (scene) {
				createGameBoard(16, 16);
				
				// Add some debug cells to visualize
				addDebugCells();
			}
			return;
		}
		
		// Get board group or create it if it doesn't exist
		let boardGroup = scene.getObjectByName('gameBoard');
		if (!boardGroup) {
			boardGroup = new THREE.Group();
			boardGroup.name = 'gameBoard';
			scene.add(boardGroup);
		}
		
		// Clear existing cells
		const existingCells = boardGroup.getObjectByName('cells');
		if (existingCells) {
			boardGroup.remove(existingCells);
		}
		
		// Create cells container
		const cellsContainer = new THREE.Group();
		cellsContainer.name = 'cells';
		boardGroup.add(cellsContainer);
		
		// Create cells based on board data
		const boardHeight = board.length;
		const boardWidth = boardHeight > 0 ? board[0].length : 0;
		
		// Update game board size if needed
		if (boardWidth > 0 && boardHeight > 0) {
			createGameBoard(boardWidth, boardHeight);
		}
		
		// Create cells for non-empty board positions
		for (let z = 0; z < boardHeight; z++) {
			if (!board[z]) continue;
			
			for (let x = 0; x < board[z].length; x++) {
				const cellValue = board[z][x];
				if (cellValue) {
					// Create cell geometry
					const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
					
					// Get appropriate material
					const material = getCellMaterial(cellValue);
					
					// Create mesh
					const cell = new THREE.Mesh(geometry, material);
					cell.position.set(x + 0.5, 0.5, z + 0.5);
					cell.userData.type = 'cell';
					cell.userData.x = x;
					cell.userData.z = z;
					cell.userData.value = cellValue;
					
					// Add cell to container
					cellsContainer.add(cell);
					
					// Add floating animation
					createFloatingAnimation(cell);
					
					console.log(`Created cell at (${x}, ${z}) with value:`, cellValue);
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
 * Add debug cells to visualize the board when there's no valid game data
 */
function addDebugCells() {
	try {
		// Get board group
		let boardGroup = scene.getObjectByName('gameBoard');
		if (!boardGroup) return;
		
		// Create cells container
		const cellsContainer = new THREE.Group();
		cellsContainer.name = 'debugCells';
		boardGroup.add(cellsContainer);
		
		// Create some cells in a pattern
		const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
		
		// Create a pattern of cells
		for (let z = 0; z < 3; z++) {
			for (let x = 0; x < 3; x++) {
				const geometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
				const material = new THREE.MeshStandardMaterial({
					color: colors[(z * 3 + x) % colors.length],
					roughness: 0.3,
					metalness: 0.7
				});
				
				const cell = new THREE.Mesh(geometry, material);
				cell.position.set(x * 2 + 4, 0.5, z * 2 + 4);
				cell.userData.type = 'debugCell';
				cell.userData.x = x;
				cell.userData.z = z;
				
				// Add cell to container
				cellsContainer.add(cell);
				
				// Add floating animation
				createFloatingAnimation(cell);
			}
		}
		
		console.log('Added debug cells to visualize the board');
		return true;
	} catch (error) {
		console.error('Error adding debug cells:', error);
		return false;
	}
}

/**
 * Check if a cell is connected to other cells
 * @param {Array} board - Game board
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @returns {boolean} - Whether the cell is connected
 */
function isConnectedToOtherCells(board, x, z) {
	// Check adjacent cells (right, left, up, down)
	const directions = [
		{dx: 1, dz: 0},
		{dx: -1, dz: 0},
		{dx: 0, dz: 1},
		{dx: 0, dz: -1}
	];
	
	let connectedCount = 0;
	
	for (const dir of directions) {
		const newX = x + dir.dx;
		const newZ = z + dir.dz;
		
		// Check if the adjacent cell is within bounds and has a value
		if (board[newZ] && board[newZ][newX]) {
			connectedCount++;
		}
	}
	
	return connectedCount > 0;
}

/**
 * Update appearance of an existing cell
 * @param {THREE.Mesh} cell - Cell mesh to update
 * @param {*} cellValue - Value from the game board
 * @param {boolean} isConnected - Whether the cell is connected to others
 */
function updateCellAppearance(cell, cellValue, isConnected = false) {
	if (!cell) return;
	
	// Update material if needed
	const material = getCellMaterial(cellValue);
	cell.material.color.copy(material.color);
	
	// Add slight glow effect to enhance visibility in the dark sky
	cell.material.emissive = new THREE.Color(
		cell.material.color.r * 0.2,
		cell.material.color.g * 0.2,
		cell.material.color.b * 0.2
	);
	
	// Update floating animation parameters
	let floatingAnimation = activeAnimations.floatingCells.find(a => a.cell === cell);
	
	if (!floatingAnimation) {
		floatingAnimation = createFloatingAnimation(cell);
		activeAnimations.floatingCells.push(floatingAnimation);
	}
	
	// Connected cells float less than isolated ones to create the island effect
	floatingAnimation.amplitude = isConnected ? 0.05 : 0.15;
	
	// Update other properties based on cell type
	if (typeof cellValue === 'object' && cellValue.properties) {
		const { height, highlight } = cellValue.properties;
		
		// Apply height if specified
		if (height !== undefined) {
			cell.scale.y = height;
			cell.position.y = height * 0.5;
		}
		
		// Apply highlight if needed
		if (highlight) {
			// Add stronger emission for highlighted cells
			cell.material.emissive = new THREE.Color(
				cell.material.color.r * 0.4,
				cell.material.color.g * 0.4,
				cell.material.color.b * 0.4
			);
		}
	}
}

/**
 * Create floating animation for a cell
 * @param {THREE.Mesh} cell - Cell mesh to animate
 * @returns {Object} - Animation object
 */
function createFloatingAnimation(cell) {
	try {
		if (!cell) return null;
		
		// Store original position
		const originalY = cell.position.y;
		
		// Random offset for animation to make cells not float in sync
		const timeOffset = Math.random() * Math.PI * 2;
		
		// Random amplitude between 0.1 and 0.3
		const amplitude = 0.1 + Math.random() * 0.2;
		
		// Random period between 1 and 3 seconds
		const period = 1 + Math.random() * 2;
		
		// Random rotation amplitude
		const rotationAmplitude = Math.random() * 0.01;
		
		// Animation function
		const animate = (time, deltaTime) => {
			if (!cell) return;
			
			// Calculate wave
			const wave = Math.sin((time * 0.001 / period) + timeOffset);
			
			// Update position
			cell.position.y = originalY + wave * amplitude;
			
			// Add slight rotation to enhance floating effect
			cell.rotation.x = Math.sin(time * 0.0005) * rotationAmplitude;
			cell.rotation.z = Math.cos(time * 0.0007) * rotationAmplitude;
		};
		
		// Add to animation callbacks
		if (animationCallbacks) {
			animationCallbacks.push(animate);
		}
		
		return {
			cell,
			originalY,
			animate,
			timeOffset,
			amplitude,
			period,
			active: true
		};
	} catch (error) {
		console.error('Error creating floating animation:', error);
		return null;
	}
}

/**
 * Create a skybox with Russian theme
 */
function createSkybox() {
	// Use a gradient sky
	const vertexShader = `
		varying vec3 vWorldPosition;
		void main() {
			vec4 worldPosition = modelMatrix * vec4(position, 1.0);
			vWorldPosition = worldPosition.xyz;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`;
	
	const fragmentShader = `
		uniform vec3 topColor;
		uniform vec3 bottomColor;
		uniform float offset;
		uniform float exponent;
		varying vec3 vWorldPosition;
		void main() {
			float h = normalize(vWorldPosition + offset).y;
			gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
		}
	`;
	
	const uniforms = {
		topColor: { value: new THREE.Color(0x0077ff) },
		bottomColor: { value: new THREE.Color(0xffffff) },
		offset: { value: 33 },
		exponent: { value: 0.6 }
	};
	
	const skyGeo = new THREE.SphereGeometry(500, 32, 15);
	const skyMat = new THREE.ShaderMaterial({
		uniforms: uniforms,
		vertexShader: vertexShader,
		fragmentShader: fragmentShader,
		side: THREE.BackSide
	});
	
	const sky = new THREE.Mesh(skyGeo, skyMat);
	sky.name = 'env_sky';
	scene.add(sky);
}

/**
 * Add ornate decorations to the board edges for Russian theme
 */
function addBoardDecorations() {
	// Add decorative columns at corners
	const columnGeometry = new THREE.CylinderGeometry(0.3, 0.3, 2, 8);
	const columnMaterial = new THREE.MeshStandardMaterial({
		color: 0x8B4513,
		roughness: 0.7,
		metalness: 0.3
	});
	
	// Positions for the corner columns - adjust based on board size
	const boardWidth = 10;
	const boardHeight = 20;
	
	const cornerPositions = [
		[-0.5, 1, -0.5],  // Front left
		[boardWidth - 0.5, 1, -0.5],   // Front right
		[-0.5, 1, boardHeight - 0.5],  // Back left
		[boardWidth - 0.5, 1, boardHeight - 0.5]    // Back right
	];
	
	cornerPositions.forEach((pos, index) => {
		const column = new THREE.Mesh(columnGeometry, columnMaterial);
		
		column.position.set(pos[0], pos[1], pos[2]);
		column.castShadow = true;
		column.name = `env_column_${index}`;
		scene.add(column);
		
		// Add ornate top to each column
		const topGeometry = new THREE.SphereGeometry(0.4, 8, 8);
		const topMaterial = new THREE.MeshStandardMaterial({
			color: 0xB8860B,
			roughness: 0.5,
			metalness: 0.5
		});
		const top = new THREE.Mesh(topGeometry, topMaterial);
		top.position.set(pos[0], pos[1] + 1.1, pos[2]);
		top.castShadow = true;
		top.name = `env_columnTop_${index}`;
		scene.add(top);
	});
}

/**
 * Add Russian-themed environmental elements
 */
function addRussianEnvironmentElements() {
	try {
		// Add stylized onion dome in the distance (Russian church)
		const domeBaseGeometry = new THREE.CylinderGeometry(2, 2, 4, 16);
		const domeTopGeometry = new THREE.SphereGeometry(2, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
		const domeSpikeGeometry = new THREE.ConeGeometry(0.5, 2, 8);
		
		// Use a fallback material since the texture might not exist
		const domeMaterial = new THREE.MeshStandardMaterial({
			color: 0x4682B4, // Steel blue color
			roughness: 0.7,
			metalness: 0.3
		});
		
		const domeBase = new THREE.Mesh(domeBaseGeometry, domeMaterial);
		domeBase.position.set(-20, 5, -25);
		
		const domeTop = new THREE.Mesh(domeTopGeometry, domeMaterial);
		domeTop.position.set(-20, 9, -25);
		
		const domeSpike = new THREE.Mesh(domeSpikeGeometry, domeMaterial);
		domeSpike.position.set(-20, 11, -25);
		
		scene.add(domeBase);
		scene.add(domeTop);
		scene.add(domeSpike);
		
		// Add some smaller domes
		const colors = [0x8B0000, 0x006400, 0x4B0082, 0x000080]; // Dark red, dark green, indigo, navy
		
		for (let i = 0; i < 4; i++) {
			const smallBase = new THREE.Mesh(
				new THREE.CylinderGeometry(1, 1, 2, 16),
				new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7, metalness: 0.3 })
			);
			const smallTop = new THREE.Mesh(
				new THREE.SphereGeometry(1, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2),
				new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7, metalness: 0.3 })
			);
			const smallSpike = new THREE.Mesh(
				new THREE.ConeGeometry(0.25, 1, 8),
				new THREE.MeshStandardMaterial({ color: 0xFFD700, roughness: 0.3, metalness: 0.8 }) // Gold
			);
			
			const xOffset = -15 + i * 3;
			smallBase.position.set(xOffset, 2, -23);
			smallTop.position.set(xOffset, 4, -23);
			smallSpike.position.set(xOffset, 5, -23);
			
			scene.add(smallBase);
			scene.add(smallTop);
			scene.add(smallSpike);
		}
		
		console.log('Russian environment elements added successfully');
	} catch (error) {
		console.error('Error adding Russian environment elements:', error);
		// Continue with other initialization steps even if this fails
	}
}

/**
 * Add forest of stylized Russian trees
 */
function addTreesForest() {
	// Tree geometries
	const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 5, 8);
	const leafGeometry = new THREE.ConeGeometry(2, 4, 8);
	
	// Tree materials
	const trunkMaterial = new THREE.MeshStandardMaterial({
		color: 0x8B4513,
		roughness: 0.9,
		metalness: 0.1
	});
	
	const leafMaterial = new THREE.MeshStandardMaterial({
		color: 0x228B22,
		roughness: 0.8,
		metalness: 0.1
	});
	
	// Tree positions - on both sides of the board
	const treePositions = [
		[-15, 0, -15],
		[-10, 0, -20],
		[-20, 0, -10],
		[-12, 0, -25],
		[-25, 0, -15],
		[25, 0, -15],
		[20, 0, -10],
		[15, 0, -20],
		[30, 0, -25]
	];
	
	// Create tree group
	const treeGroup = new THREE.Group();
	treeGroup.name = 'env_trees';
	
	treePositions.forEach((pos, index) => {
		// Create tree trunk
		const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
		trunk.position.set(pos[0], pos[1] + 2.5, pos[2]);
		trunk.castShadow = true;
		trunk.name = `env_treeTrunk_${index}`;
		
		// Create tree leaves
		const leaves = new THREE.Mesh(leafGeometry, leafMaterial);
		leaves.position.set(pos[0], pos[1] + 6, pos[2]);
		leaves.castShadow = true;
		leaves.name = `env_treeLeaves_${index}`;
		
		// Add to tree group
		treeGroup.add(trunk);
		treeGroup.add(leaves);
	});
	
	scene.add(treeGroup);
}

/**
 * Add distant mountains to the scene
 */
function addDistantMountains() {
	// Mountain geometry
	const mountainGeometry = new THREE.ConeGeometry(20, 30, 4);
	
	// Mountain material
	const mountainMaterial = new THREE.MeshStandardMaterial({
		color: 0x708090,
		roughness: 0.9,
		metalness: 0.1
	});
	
	// Mountain positions
	const mountainPositions = [
		[-50, -10, -100],
		[-80, -10, -100],
		[-20, -10, -100],
		[20, -10, -100],
		[60, -10, -100]
	];
	
	// Create mountain group
	const mountainGroup = new THREE.Group();
	mountainGroup.name = 'env_mountains';
	
	mountainPositions.forEach((pos, index) => {
		const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
		mountain.position.set(pos[0], pos[1], pos[2]);
		mountain.scale.set(
			0.7 + Math.random() * 0.6,
			0.7 + Math.random() * 0.6,
			0.7 + Math.random() * 0.6
		);
		mountain.rotation.y = Math.random() * Math.PI;
		mountain.castShadow = false; // Too far to cast shadows
		mountain.name = `env_mountain_${index}`;
		mountainGroup.add(mountain);
	});
	
	scene.add(mountainGroup);
}

/**
 * Add snow particle effect
 */
function addSnowEffect() {
	// Create particles
	const snowCount = 1000;
	const snowGeometry = new THREE.BufferGeometry();
	const snowVertices = [];
	
	for (let i = 0; i < snowCount; i++) {
		// Random position in a cube around the board
		const x = Math.random() * 80 - 40;
		const y = Math.random() * 50;
		const z = Math.random() * 80 - 40;
		
		snowVertices.push(x, y, z);
	}
	
	snowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(snowVertices, 3));
	
	// Snow material
	const snowMaterial = new THREE.PointsMaterial({
		color: 0xffffff,
		size: 0.3,
		transparent: true,
		opacity: 0.8
	});
	
	// Create snow particles
	const snow = new THREE.Points(snowGeometry, snowMaterial);
	snow.name = 'env_snow';
	scene.add(snow);
	
	// Animate snow
	function animateSnow() {
		// Get current positions
		const positions = snow.geometry.attributes.position.array;
		
		// Update each particle
		for (let i = 0; i < positions.length; i += 3) {
			// Move down slowly
			positions[i + 1] -= 0.05;
			
			// Add slight sideways movement
			positions[i] += Math.sin(Date.now() * 0.001 + i) * 0.01;
			
			// Reset if below ground
			if (positions[i + 1] < 0) {
				positions[i + 1] = 50;
			}
		}
		
		// Mark for update
		snow.geometry.attributes.position.needsUpdate = true;
		
		// Continue animation
		requestAnimationFrame(animateSnow);
	}
	
	// Start animation
	animateSnow();
}

/**
 * Add clouds to the sky
 */
function addClouds() {
	// Create a cloud group
	const cloudGroup = new THREE.Group();
	cloudGroup.name = 'env_clouds';
	
	// Create several cloud puffs
	const puffGeometry = new THREE.SphereGeometry(2, 8, 8);
	const cloudMaterial = new THREE.MeshStandardMaterial({
		color: 0xffffff,
		roughness: 1.0,
		metalness: 0.0,
		transparent: true,
		opacity: 0.9
	});
	
	// Create clouds at different positions
	const cloudPositions = [
		[-30, 40, -50],
		[20, 35, -60],
		[-10, 45, -40],
		[40, 50, -30],
		[-40, 55, -20]
	];
	
	cloudPositions.forEach((pos, index) => {
		const cloudPuff = new THREE.Group();
		
		// Create multiple puffs per cloud
		for (let i = 0; i < 5; i++) {
			const puff = new THREE.Mesh(puffGeometry, cloudMaterial);
			puff.position.set(
				Math.random() * 5 - 2.5,
				Math.random() * 2 - 1,
				Math.random() * 5 - 2.5
			);
			puff.scale.set(
				0.7 + Math.random() * 0.6,
				0.7 + Math.random() * 0.6,
				0.7 + Math.random() * 0.6
			);
			cloudPuff.add(puff);
		}
		
		cloudPuff.position.set(pos[0], pos[1], pos[2]);
		cloudPuff.name = `env_cloud_${index}`;
		cloudGroup.add(cloudPuff);
	});
	
	scene.add(cloudGroup);
	
	// Animate clouds slowly
	animateClouds(cloudGroup);
}

/**
 * Animate clouds with slow movement
 */
function animateClouds(cloudGroup) {
	// Store original positions
	cloudGroup.children.forEach(cloud => {
		cloud.userData.originalX = cloud.position.x;
		cloud.userData.speed = 0.02 + Math.random() * 0.03;
		cloud.userData.amplitude = 10 + Math.random() * 20;
	});
	
	// Animation function
	function animate() {
		cloudGroup.children.forEach(cloud => {
			cloud.position.x = cloud.userData.originalX + Math.sin(Date.now() * 0.0001 * cloud.userData.speed) * cloud.userData.amplitude;
		});
		
		requestAnimationFrame(animate);
	}
	
	animate();
}

/**
 * Handle window resize
 */
function handleResize() {
	if (!canvas) return;
	
	// Update canvas size
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	
	if (currentMode === RENDER_MODES.MODE_2D) {
		// No additional setup needed for 2D
	} else if (renderer && camera) {
		// Update renderer size
		renderer.setSize(window.innerWidth, window.innerHeight);
		
		// Update camera aspect ratio
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}
}

/**
 * Set the current game state
 * @param {Object} gameState - New game state
 */
export function setGameState(gameState) {
	try {
		// Throttle updates to prevent excessive rendering
		const now = Date.now();
		if (now - lastRendererUpdate < MIN_RENDERER_UPDATE_INTERVAL) {
			// Only log in debug mode and when explicitly requested
			if (debugMode && window.VERBOSE_LOGGING) {
				console.log(`Renderer update throttled`);
			}
			return;
		}
		lastRendererUpdate = now;
		
		// Skip update if state is null
		if (!gameState) {
			return;
		}
		
		// Check if game state has actually changed in a meaningful way
		if (currentGameState) {
			const currentBoardKey = JSON.stringify(currentGameState.board || []);
			const newBoardKey = JSON.stringify(gameState.board || []);
			
			const currentTetrominoKey = JSON.stringify(currentGameState.currentTetromino || null);
			const newTetrominoKey = JSON.stringify(gameState.currentTetromino || null);
			
			const currentChessPiecesKey = JSON.stringify(currentGameState.chessPieces || []);
			const newChessPiecesKey = JSON.stringify(gameState.chessPieces || []);
			
			// If visual elements haven't changed, just update UI and return
			if (currentBoardKey === newBoardKey && 
				currentTetrominoKey === newTetrominoKey && 
				currentChessPiecesKey === newChessPiecesKey) {
				
				updateUI3D(gameState);
				currentGameState = gameState;
				return;
			}
		}
		
		// Store the new state
		currentGameState = gameState;
		
		// If in 3D mode, update the 3D rendering
		if (is3DMode && scene) {
			// Update board visualization based on the new state
			try {
				// Directly call the updateBoardVisualization function
				updateBoardVisualization(gameState.board || []);
			} catch (error) {
				console.warn('Error updating board visualization:', error);
			}
			
			// Update chess pieces and tetrominos
			try {
				updateGameEntities(gameState);
			} catch (error) {
				console.warn('Error updating game entities:', error);
			}
			
			// Update UI elements
			updateUI3D(gameState);
		}
		
		// Update game state visualization in general
		if (_isInitialized) {
			handleGameStateChange(gameState);
		}
		
		// Update turn timer
		if (gameState.turnTimeRemaining !== undefined) {
			updateTurnTimer(gameState.turnTimeRemaining);
		}
		
		// Only log in debug mode and when explicitly requested
		if (debugMode && window.VERBOSE_LOGGING) {
			console.log('UI updated based on game state');
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
 * Render in 2D mode
 */
function render2D() {
	if (!context || !canvas) {
		return;
	}
	
	// Clear canvas
	context.clearRect(0, 0, canvas.width, canvas.height);
	
	// Draw background
	context.fillStyle = '#121212';
	context.fillRect(0, 0, canvas.width, canvas.height);
	
	// If we have a game state, render it
	if (currentGameState) {
		renderBoard2D(currentGameState);
	} else {
		// Draw some debug info
		context.fillStyle = '#ffffff';
		context.font = '14px Arial';
		context.fillText('2D Renderer Active - No Game State', 10, 20);
	}
}

/**
 * Render the game board in 2D
 * @param {Object} gameState - Game state object
 */
function renderBoard2D(gameState) {
	try {
		// Calculate board size and position
		const cellSize = settings.cellSize || 30;
		const boardWidth = (gameState.board && gameState.board[0]?.length) || 10;
		const boardHeight = (gameState.board && gameState.board.length) || 20;
		const boardPixelWidth = boardWidth * cellSize;
		const boardPixelHeight = boardHeight * cellSize;
		
		// Calculate board position (centered)
		const boardX = (canvas.width - boardPixelWidth) / 2;
		const boardY = (canvas.height - boardPixelHeight) / 2;
		
		// Draw board background
		context.fillStyle = '#1a1a1a';
		context.fillRect(boardX, boardY, boardPixelWidth, boardPixelHeight);
		
		// Draw grid lines if enabled
		if (settings.showGrid) {
			context.strokeStyle = '#333333';
			context.lineWidth = 1;
			
			// Vertical grid lines
			for (let x = 0; x <= boardWidth; x++) {
				const lineX = boardX + x * cellSize;
				context.beginPath();
				context.moveTo(lineX, boardY);
				context.lineTo(lineX, boardY + boardPixelHeight);
				context.stroke();
			}
			
			// Horizontal grid lines
			for (let y = 0; y <= boardHeight; y++) {
				const lineY = boardY + y * cellSize;
				context.beginPath();
				context.moveTo(boardX, lineY);
				context.lineTo(boardX + boardPixelWidth, lineY);
				context.stroke();
			}
		}
		
		// Draw cells
		if (gameState.board) {
			for (let y = 0; y < boardHeight; y++) {
				for (let x = 0; x < boardWidth; x++) {
					const cell = gameState.board[y][x];
					if (cell) {
						const cellX = boardX + x * cellSize;
						const cellY = boardY + y * cellSize;
						
						// Draw cell
						context.fillStyle = getCellColor2D(cell);
						context.fillRect(cellX, cellY, cellSize, cellSize);
						
						// Draw cell border
						context.strokeStyle = '#000000';
						context.lineWidth = 1;
						context.strokeRect(cellX, cellY, cellSize, cellSize);
					}
				}
			}
		}
		
		// Draw ghost piece if enabled
		if (settings.showGhostPiece && gameState.currentTetromino && gameState.ghostPosition) {
			renderGhostPiece2D(
				gameState.currentTetromino.shape,
				gameState.ghostPosition,
				gameState.currentTetromino.type,
				boardX,
				boardY,
				cellSize
			);
		}
		
		// Draw current tetromino
		if (gameState.currentTetromino) {
			renderTetromino2D(gameState.currentTetromino, boardX, boardY, cellSize);
		}
		
		// Draw chess pieces
		if (gameState.chessPieces) {
			renderChessPieces2D(gameState.chessPieces, boardX, boardY, cellSize);
		}
		
		// Draw UI elements
		renderUI2D(gameState, boardX, boardY, cellSize, boardPixelWidth, boardPixelHeight);
	} catch (error) {
		console.error('Error rendering board in 2D:', error);
	}
}

/**
 * Render tetromino in 2D
 * @param {Object} tetromino - Tetromino object
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderTetromino2D(tetromino, boardX, boardY, cellSize) {
	try {
		const { shape, position, type } = tetromino;
		
		if (!shape || !position) {
			return;
		}
		
		// Draw tetromino blocks
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const worldX = position.x + x;
					const worldY = position.y + y;
					const cellX = boardX + worldX * cellSize;
					const cellY = boardY + worldY * cellSize;
					
					// Draw tetromino cell
					context.fillStyle = getTetrominoColor2D(type);
					context.fillRect(cellX, cellY, cellSize, cellSize);
					
					// Draw cell border
					context.strokeStyle = '#000000';
					context.lineWidth = 1;
					context.strokeRect(cellX, cellY, cellSize, cellSize);
				}
			}
		}
		
		// Draw height indicator
		if (position.z !== undefined && position.z > 0) {
			// Calculate center of tetromino
			let centerX = 0;
			let centerY = 0;
			let blockCount = 0;
			
			for (let y = 0; y < shape.length; y++) {
				for (let x = 0; x < shape[y].length; x++) {
					if (shape[y][x]) {
						centerX += (position.x + x);
						centerY += (position.y + y);
						blockCount++;
					}
				}
			}
			
			if (blockCount > 0) {
				centerX = boardX + (centerX / blockCount) * cellSize + cellSize / 2;
				centerY = boardY + (centerY / blockCount) * cellSize + cellSize / 2;
				
				// Draw height number
				context.fillStyle = '#ffffff';
				context.font = 'bold ' + Math.floor(cellSize * 0.8) + 'px Arial';
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				
				// Background circle for better visibility
				context.beginPath();
				context.arc(centerX, centerY, cellSize * 0.4, 0, Math.PI * 2);
				context.fillStyle = 'rgba(0, 0, 0, 0.7)';
				context.fill();
				
				// Height text
				context.fillStyle = '#ffffff';
				context.fillText(Math.ceil(position.z).toString(), centerX, centerY);
			}
		}
	} catch (error) {
		console.error('Error rendering tetromino in 2D:', error);
	}
}

/**
 * Render ghost piece in 2D
 * @param {Array} shape - Tetromino shape
 * @param {Object} position - Ghost position
 * @param {string|number} type - Tetromino type
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderGhostPiece2D(shape, position, type, boardX, boardY, cellSize) {
	try {
		if (!shape || !position) {
			return;
		}
		
		// Draw ghost tetromino blocks
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const worldX = position.x + x;
					const worldY = position.y + y;
					const cellX = boardX + worldX * cellSize;
					const cellY = boardY + worldY * cellSize;
					
					// Get tetromino color and make it transparent
					const color = getTetrominoColor2D(type);
					const colorValues = color.match(/\d+/g);
					if (colorValues && colorValues.length >= 3) {
						// Draw ghost cell (outline only)
						context.strokeStyle = `rgba(${colorValues[0]}, ${colorValues[1]}, ${colorValues[2]}, 0.5)`;
						context.lineWidth = 2;
						context.strokeRect(cellX + 2, cellY + 2, cellSize - 4, cellSize - 4);
						
						// Add pattern to ghost piece
						context.fillStyle = `rgba(${colorValues[0]}, ${colorValues[1]}, ${colorValues[2]}, 0.2)`;
						context.fillRect(cellX + 2, cellY + 2, cellSize - 4, cellSize - 4);
					}
				}
			}
		}
	} catch (error) {
		console.error('Error rendering ghost piece in 2D:', error);
	}
}

/**
 * Render chess pieces in 2D
 * @param {Array} chessPieces - Chess pieces array
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderChessPieces2D(chessPieces, boardX, boardY, cellSize) {
	try {
		for (const piece of chessPieces) {
			if (!piece || !piece.type || !piece.position) {
				continue;
			}
			
			const { type, position, player } = piece;
			const { x, y } = position;
			
			const pieceX = boardX + x * cellSize;
			const pieceY = boardY + y * cellSize;
			
			// Draw chess piece
			const pieceChar = getChessPieceChar(type, player);
			const color = player === 1 ? '#ffffff' : '#000000';
			const outline = player === 1 ? '#000000' : '#ffffff';
			
			// Draw piece
			context.font = 'bold ' + Math.floor(cellSize * 0.7) + 'px Arial';
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			
			// Draw outline for better visibility
			context.strokeStyle = outline;
			context.lineWidth = 2;
			context.strokeText(pieceChar, pieceX + cellSize / 2, pieceY + cellSize / 2);
			
			// Draw piece
			context.fillStyle = color;
			context.fillText(pieceChar, pieceX + cellSize / 2, pieceY + cellSize / 2);
		}
	} catch (error) {
		console.error('Error rendering chess pieces in 2D:', error);
	}
}

/**
 * Render UI elements in 2D
 */
function renderUI2D(gameState, boardX, boardY, cellSize, boardPixelWidth, boardPixelHeight) {
	try {
		// Draw next tetromino preview
		if (gameState.nextTetromino) {
			const previewX = boardX + boardPixelWidth + 20;
			const previewY = boardY;
			const previewSize = cellSize * 0.8;
			
			// Draw preview box
			context.fillStyle = '#1a1a1a';
			context.fillRect(previewX, previewY, previewSize * 4, previewSize * 4);
			
			// Draw label
			context.fillStyle = '#ffffff';
			context.font = '16px Arial';
			context.textAlign = 'left';
			context.textBaseline = 'top';
			context.fillText('Next:', previewX, previewY - 20);
			
			// Draw next tetromino
			const { shape, type } = gameState.nextTetromino;
			if (shape) {
				// Get tetromino dimensions
				let minX = shape[0].length;
				let minY = shape.length;
				let maxX = 0;
				let maxY = 0;
				
				for (let y = 0; y < shape.length; y++) {
					for (let x = 0; x < shape[y].length; x++) {
						if (shape[y][x]) {
							minX = Math.min(minX, x);
							minY = Math.min(minY, y);
							maxX = Math.max(maxX, x);
							maxY = Math.max(maxY, y);
						}
					}
				}
				
				const tetrominoWidth = maxX - minX + 1;
				const tetrominoHeight = maxY - minY + 1;
				
				// Center tetromino in preview box
				const offsetX = previewX + (4 - tetrominoWidth) * previewSize / 2;
				const offsetY = previewY + (4 - tetrominoHeight) * previewSize / 2;
				
				// Draw tetromino
				for (let y = 0; y < shape.length; y++) {
					for (let x = 0; x < shape[y].length; x++) {
						if (shape[y][x]) {
							const cellX = offsetX + (x - minX) * previewSize;
							const cellY = offsetY + (y - minY) * previewSize;
							
							// Draw cell
							context.fillStyle = getTetrominoColor2D(type);
							context.fillRect(cellX, cellY, previewSize, previewSize);
							
							// Draw cell border
							context.strokeStyle = '#000000';
							context.lineWidth = 1;
							context.strokeRect(cellX, cellY, previewSize, previewSize);
						}
					}
				}
			}
		}
		
		// Draw score and level
		if (gameState.score !== undefined || gameState.level !== undefined) {
			const infoX = boardX;
			const infoY = boardY + boardPixelHeight + 20;
			
			context.fillStyle = '#ffffff';
			context.font = '16px Arial';
			context.textAlign = 'left';
			context.textBaseline = 'top';
			
			if (gameState.score !== undefined) {
				context.fillText(`Score: ${gameState.score}`, infoX, infoY);
			}
			
			if (gameState.level !== undefined) {
				context.fillText(`Level: ${gameState.level}`, infoX, infoY + 25);
			}
		}
	} catch (error) {
		console.error('Error rendering UI in 2D:', error);
	}
}

/**
 * Get character for chess piece
 * @param {string} type - Piece type
 * @param {number} player - Player number
 * @returns {string} Chess piece character
 */
function getChessPieceChar(type, player) {
	const pieces = {
		'pawn': '♟',
		'knight': '♞',
		'bishop': '♝',
		'rook': '♜',
		'queen': '♛',
		'king': '♚'
	};
	
	return pieces[type.toLowerCase()] || '?';
}

/**
 * Get color for a cell in 2D
 * @param {number|string} cell - Cell value
 * @returns {string} Color as CSS color string
 */
function getCellColor2D(cell) {
	// Default colors for different cell types
	const colors = {
		1: 'rgb(0, 255, 255)', // Cyan (I)
		2: 'rgb(255, 255, 0)', // Yellow (O)
		3: 'rgb(128, 0, 128)', // Purple (T)
		4: 'rgb(0, 255, 0)',   // Green (S)
		5: 'rgb(255, 0, 0)',   // Red (Z)
		6: 'rgb(0, 0, 255)',   // Blue (J)
		7: 'rgb(255, 127, 0)', // Orange (L)
		'p1': 'rgb(50, 50, 150)', // Player 1 home zone
		'p2': 'rgb(150, 50, 50)',  // Player 2 home zone
		'wall': 'rgb(50, 50, 50)'  // Wall
	};
	
	// If cell is an object with a type property, use that
	if (typeof cell === 'object' && cell.type) {
		return colors[cell.type] || 'rgb(150, 150, 150)';
	}
	
	// Otherwise use the cell value directly
	return colors[cell] || 'rgb(150, 150, 150)';
}

/**
 * Get color for a tetromino in 2D
 * @param {number|string} type - Tetromino type
 * @returns {string} Color as CSS color string
 */
function getTetrominoColor2D(type) {
	const colors = {
		'I': 'rgb(0, 255, 255)', // Cyan
		'O': 'rgb(255, 255, 0)', // Yellow
		'T': 'rgb(128, 0, 128)', // Purple
		'S': 'rgb(0, 255, 0)',   // Green
		'Z': 'rgb(255, 0, 0)',   // Red
		'J': 'rgb(0, 0, 255)',   // Blue
		'L': 'rgb(255, 127, 0)', // Orange
		1: 'rgb(0, 255, 255)',   // Cyan (I)
		2: 'rgb(255, 255, 0)',   // Yellow (O)
		3: 'rgb(128, 0, 128)',   // Purple (T)
		4: 'rgb(0, 255, 0)',     // Green (S)
		5: 'rgb(255, 0, 0)',     // Red (Z)
		6: 'rgb(0, 0, 255)',     // Blue (J)
		7: 'rgb(255, 127, 0)'    // Orange (L)
	};
	
	return colors[type] || 'rgb(150, 150, 150)';
}

/**
 * Update all animations
 * @param {number} timestamp - Current timestamp
 * @param {number} deltaTime - Time since last frame in ms
 */
function updateAnimations(timestamp, deltaTime) {
	try {
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
		
		// Update victory/defeat animations if active
		if (victoryAnimation && victoryAnimation.update) {
			victoryAnimation.update(deltaTime);
		}
		
		if (defeatAnimation && defeatAnimation.update) {
			defeatAnimation.update(deltaTime);
		}
	} catch (error) {
		console.error('Error updating animations:', error);
	}
}

/**
 * Render in 3D mode
 * @param {number} timestamp - Current timestamp
 * @returns {boolean} - Whether the render was successful
 */
function render3D(timestamp) {
	try {
		if (!renderer || !scene || !camera) {
			console.warn('Cannot render: missing 3D components');
			return false;
		}
		
		// Calculate delta time
		const deltaTime = timestamp - (lastFrameTime || timestamp);
		lastFrameTime = timestamp;
		
		// Update controls if available
		if (controls && typeof controls.update === 'function') {
			controls.update();
		}
		
		// Render the scene
		renderer.render(scene, camera);
		
		// Update FPS counter
		frameCount++;
		framesThisSecond++;
		
		if (timestamp - lastFpsUpdate >= 1000) {
			currentFps = framesThisSecond;
			framesThisSecond = 0;
			lastFpsUpdate = timestamp;
			
			// Update debug info
			updateDebugInfo();
		}
		
		return true;
	} catch (error) {
		console.error('Error rendering in 3D:', error);
		return false;
	}
}

/**
 * Handle window resize for 3D scene
 */
function onWindowResize() {
	if (!renderer || !camera) return;
	
	// Update renderer size
	renderer.setSize(window.innerWidth, window.innerHeight);
	
	// Update camera aspect ratio
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
}

/**
 * Update UI elements based on game state
 * @param {Object} gameState - Current game state
 */
export function updateUI3D(gameState) {
	try {
		if (!gameState) return;
		
		// Update scores
		if (gameState.players) {
			updateScoreDisplay(gameState.players);
		}
		
		// Update turn indicator
		if (gameState.currentPlayer) {
			updateTurnIndicator(gameState.currentPlayer, gameState.turnPhase);
		}
		
		// Update turn timer
		if (gameState.turnTimeRemaining !== undefined) {
			updateTurnTimer(gameState.turnTimeRemaining);
		}
		
		// Only log in debug mode and when explicitly requested
		if (debugMode && window.VERBOSE_LOGGING) {
			console.log('UI updated based on game state');
		}
	} catch (error) {
		console.error('Error updating UI:', error);
	}
}

/**
 * Update score display
 * @param {Array} players - Player data
 */
export function updateScoreDisplay(players) {
	try {
		if (!players) return;
		
		// Get score elements
		const player1ScoreElement = document.getElementById('player1-score');
		const player2ScoreElement = document.getElementById('player2-score');
		
		// Update scores if elements exist
		if (player1ScoreElement && players[0]) {
			player1ScoreElement.textContent = players[0].score || 0;
		}
		
		if (player2ScoreElement && players[1]) {
			player2ScoreElement.textContent = players[1].score || 0;
		}
	} catch (error) {
		console.error('Error updating score display:', error);
	}
}

/**
 * Update turn indicator
 * @param {string} currentPlayer - Current player ID
 * @param {string} turnPhase - Current turn phase
 */
export function updateTurnIndicator(currentPlayer, turnPhase) {
	try {
		// Get turn indicator element
		const turnIndicator = document.getElementById('turn-indicator');
		if (!turnIndicator) return;
		
		// Update indicator text
		turnIndicator.textContent = `${currentPlayer}'s turn - ${turnPhase}`;
		
		// Update indicator color
		turnIndicator.className = `turn-indicator ${currentPlayer}`;
	} catch (error) {
		console.error('Error updating turn indicator:', error);
	}
}

/**
 * Update turn timer display
 * @param {number} timeRemaining - Time remaining in ms
 */
export function updateTurnTimer(timeRemaining) {
	try {
		// Get timer element
		const timerElement = document.getElementById('turn-timer');
		if (!timerElement) return;
		
		// Convert to seconds and prevent console logging
		const seconds = Math.ceil(timeRemaining / 1000);
		
		// Update timer text - this was accidentally logging to console
		timerElement.textContent = `${seconds}`;
		
		// Update timer color based on urgency
		if (seconds <= 5) {
			timerElement.className = 'turn-timer urgent';
		} else if (seconds <= 15) {
			timerElement.className = 'turn-timer warning';
		} else {
			timerElement.className = 'turn-timer';
		}
	} catch (error) {
		console.error('Error updating turn timer:', error);
	}
}

/**
 * Create row clearing animation for completed rows
 * @param {Array<number>} rowsToRemove - Array of row indices to clear
 */
export function createRowClearingAnimation(rowsToRemove) {
	if (!rowsToRemove || !rowsToRemove.length || !scene) return;
	
	// Get board width from current game state
	const boardWidth = currentGameState?.board?.[0]?.length || 10;
	
	// Create row clearing animation
	const rowAnimations = animations.createRowClearingAnimation(scene, rowsToRemove, boardWidth);
	
	console.log(`Created animation for clearing ${rowsToRemove.length} rows`);
	
	return rowAnimations;
}

/**
 * Create tetromino attachment animation
 * @param {Object} tetromino - Tetromino data
 */
export function createTetrominoAttachAnimation(tetromino) {
	if (!tetromino || !scene) return;
	
	return animations.createTetrominoAttachAnimation(scene, tetromino);
}

/**
 * Create tetromino disintegration animation
 * @param {Object} tetromino - Tetromino data
 */
export function createTetrominoDisintegrationAnimation(tetromino) {
	if (!tetromino || !scene) return;
	
	return animations.createTetrominoDisintegrationAnimation(scene, tetromino);
}

/**
 * Render scene
 * @param {number} time - Current time
 */
export function render(time) {
	if (!_isInitialized) {
		return;
	}
	
	if (is3DMode) {
		render3D(time);
	} else {
		render2D();
	}
}

/**
 * Convert screen coordinates to board coordinates
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate
 * @returns {Object|null} - Board coordinates or null if outside board
 */
export function screenToBoardCoordinates(screenX, screenY) {
	if (!camera || !scene) return null;
	
	// Create a ray from the camera to the mouse position
	const mouse = new THREE.Vector2();
	mouse.x = (screenX / window.innerWidth) * 2 - 1;
	mouse.y = -(screenY / window.innerHeight) * 2 + 1;
	
	// Create raycaster
	const raycaster = new THREE.Raycaster();
	raycaster.setFromCamera(mouse, camera);
	
	// Find the board group
	const boardGroup = scene.getObjectByName('game_board');
	if (!boardGroup) return null;
	
	// Create an invisible plane at y=0 to intersect with
	const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
	const planeMaterial = new THREE.MeshBasicMaterial({
		visible: false
	});
	const plane = new THREE.Mesh(planeGeometry, planeMaterial);
	plane.rotation.x = -Math.PI / 2; // Make horizontal
	plane.position.set(0, 0, 0);     // Place at board level
	
	// Add plane to scene temporarily
	scene.add(plane);
	
	// Cast ray and check for intersection with plane
	const intersects = raycaster.intersectObject(plane);
	
	// Remove plane from scene
	scene.remove(plane);
	plane.geometry.dispose();
	plane.material.dispose();
	
	// If no intersection, return null
	if (intersects.length === 0) return null;
	
	// Get intersection point
	const point = intersects[0].point;
	
	// Convert to board coordinates
	const x = Math.floor(point.x);
	const z = Math.floor(point.z);
	
	// Check if coordinates are within board boundaries
	const boardWidth = currentGameState?.board?.[0]?.length || 8;
	const boardHeight = currentGameState?.board?.length || 8;
	
	if (x < 0 || x >= boardWidth || z < 0 || z >= boardHeight) {
		return null;
	}
	
	return { x, z };
}

/**
 * Show victory animation
 * @param {Object} player - Player who won
 */
export function showVictoryAnimation(player) {
	// Clean up any existing animations
	hideVictoryAnimation();
	hideDefeatAnimation();
	
	// Import animations module
	import('./animations.js').then(animations => {
		// Create victory animation
		victoryAnimation = animations.createVictoryAnimation(scene, camera, player);
		
		// Add animation to the render loop
		animationCallbacks.push(() => {
			if (victoryAnimation) {
				victoryAnimation.animate();
				victoryAnimation.orbitCamera();
			}
		});
		
		console.log('Victory animation created');
	}).catch(error => {
		console.error('Error creating victory animation:', error);
	});
}

/**
 * Hide victory animation
 */
export function hideVictoryAnimation() {
	if (victoryAnimation) {
		victoryAnimation.dispose();
		victoryAnimation = null;
		
		// Reset camera
		resetCamera();
	}
}

/**
 * Show defeat animation
 */
export function showDefeatAnimation() {
	// Clean up any existing animations
	hideVictoryAnimation();
	hideDefeatAnimation();
	
	// Import animations module
	import('./animations.js').then(animations => {
		// Create defeat animation
		defeatAnimation = animations.createDefeatAnimation(scene, camera);
		
		// Add animation to the render loop
		animationCallbacks.push(() => {
			if (defeatAnimation) {
				defeatAnimation.animate();
				defeatAnimation.darkenScene();
				defeatAnimation.shakeCamera();
			}
		});
		
		console.log('Defeat animation created');
	}).catch(error => {
		console.error('Error creating defeat animation:', error);
	});
}

/**
 * Hide defeat animation
 */
export function hideDefeatAnimation() {
	if (defeatAnimation) {
		defeatAnimation.dispose();
		defeatAnimation = null;
		
		// Reset camera
		resetCamera();
	}
}

/**
 * Handle game state change
 * @param {Object} newState - New game state
 * @param {Object} oldState - Previous game state (optional)
 */
export function handleGameStateChange(newState, oldState = null) {
	// Only log in debug mode
	if (debugMode) {
		console.log('Handling game state change');
	}
	
	try {
		// Update the UI
		updateUI3D(newState);
		
		// Check for game over
		if (newState.gameOver) {
			if (newState.winner === 'player1') {
				showVictoryAnimation(1);
			} else if (newState.winner === 'player2') {
				showVictoryAnimation(2);
			} else {
				// Draw or other game over condition
				showDefeatAnimation();
			}
		}
		
		// Check for animations to play
		if (newState.animations) {
			for (const animation of newState.animations) {
				switch (animation.type) {
					case 'ROW_CLEAR':
						createRowClearingAnimation(animation.data.rows);
						break;
					case 'TETROMINO_ATTACH':
						createTetrominoAttachAnimation(animation.data.tetromino);
						break;
					case 'TETROMINO_DISINTEGRATE':
						createTetrominoDisintegrationAnimation(animation.data.tetromino);
						break;
					case 'CHESS_CAPTURE':
						// TODO: Implement chess capture animation
						break;
					case 'CHESS_CHECK':
						// TODO: Implement chess check animation
						break;
					default:
						// Unknown animation type
						if (debugMode) {
							console.warn('Unknown animation type:', animation.type);
						}
				}
			}
		}
	} catch (error) {
		console.error('Error handling game state change:', error);
	}
}

/**
 * Update the game board visualization based on game state
 * @param {Object} gameState - Game state to visualize
 */
export function updateGameBoardVisualization(gameState) {
	try {
		if (!scene || !gameState || !gameState.board) {
			return false;
		}
		
		// Create a cache key for the current board state to avoid redundant updates
		const boardKey = JSON.stringify(gameState.board);
		
		// If the board hasn't changed since last update, skip rendering
		if (boardKey === lastBoardKey) {
			return true;
		}
		
		// Store current board key for future comparison
		lastBoardKey = boardKey;
		
		// Find or create the board group
		let boardGroup = scene.getObjectByName('game_board');
		if (!boardGroup) {
			boardGroup = new THREE.Group();
			boardGroup.name = 'game_board';
			scene.add(boardGroup);
		}
		
		// Clear previous board cells
		const existingCells = [];
		boardGroup.traverse(child => {
			if (child.name && child.name.startsWith('cell_')) {
				existingCells.push(child);
			}
		});
		
		// Remove old cells that shouldn't be there anymore
		existingCells.forEach(cell => {
			boardGroup.remove(cell);
		});
		
		// Create/update cells based on game state
		const board = gameState.board;
		const cellSize = settings.cellSize || 1;
		const padding = 0.05; // Small gap between cells
		
		for (let z = 0; z < board.length; z++) {
			for (let x = 0; x < board[z].length; x++) {
				const cellValue = board[z][x];
				
				// Skip empty cells
				if (!cellValue) continue;
				
				// Create cell mesh
				const cellName = `cell_${x}_${z}`;
				let cell = boardGroup.getObjectByName(cellName);
				
				if (!cell) {
					// Create new cell geometry
					const geometry = new THREE.BoxGeometry(
						cellSize - padding * 2,
						cellSize - padding * 2,
						cellSize - padding * 2
					);
					
					// Determine material based on cell value
					const material = getCellMaterial(cellValue);
					
					// Create mesh
					cell = new THREE.Mesh(geometry, material);
					cell.name = cellName;
					cell.castShadow = true;
					cell.receiveShadow = settings.showShadows;
					
					// Add to board group
					boardGroup.add(cell);
				}
				
				// Position cell
				cell.position.set(
					x * cellSize + cellSize / 2,
					cellSize / 2, // Half height
					z * cellSize + cellSize / 2
				);
				
				// Update cell appearance if needed
				updateCellAppearance2(cell, cellValue);
			}
		}
		
		// Only log during debug
		if (debugMode) {
			console.log('Board visualization updated');
		}
		return true;
	} catch (error) {
		console.error('Error updating board visualization:', error);
		return false;
	}
}

/**
 * Get cell material based on cell value
 * @param {*} cellValue - Value from the game board
 * @returns {THREE.Material} Material for the cell
 */
function getCellMaterial(cellValue) {
	// Default colors for different cell types
	const colors = {
		1: 0x00FFFF, // Cyan (I)
		2: 0xFFFF00, // Yellow (O)
		3: 0x800080, // Purple (T)
		4: 0x00FF00, // Green (S)
		5: 0xFF0000, // Red (Z)
		6: 0x0000FF, // Blue (J)
		7: 0xFF7F00, // Orange (L)
		'p1': 0x3232FF, // Player 1 home zone
		'p2': 0xFF3232, // Player 2 home zone
		'wall': 0x323232 // Wall
	};
	
	// Determine color
	let color;
	if (typeof cellValue === 'object' && cellValue.type) {
		color = colors[cellValue.type] || 0x888888;
	} else {
		color = colors[cellValue] || 0x888888;
	}
	
	// Create material
	return new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3
	});
}

/**
 * Update appearance of an existing cell
 * @param {THREE.Mesh} cell - Cell mesh to update
 * @param {*} cellValue - Value from the game board
 */
function updateCellAppearance2(cell, cellValue) {
	if (!cell) return;
	
	// Update material if needed
	const material = getCellMaterial(cellValue);
	cell.material.color.copy(material.color);
	
	// Update other properties based on cell type
	if (typeof cellValue === 'object' && cellValue.properties) {
		const { height, floating, highlight } = cellValue.properties;
		
		// Apply height if specified
		if (height !== undefined) {
			cell.scale.y = height;
			cell.position.y = height * 0.5;
		}
		
		// Apply floating animation if needed
		if (floating) {
			// Add floating animation to activeAnimations if not already there
			if (!activeAnimations.floatingCells.find(a => a.cell === cell)) {
				const animation = createFloatingAnimation2(cell);
				activeAnimations.floatingCells.push(animation);
			}
		}
		
		// Apply highlight if needed
		if (highlight) {
			// Add emission to material
			cell.material.emissive = new THREE.Color(0x444444);
			cell.material.emissiveIntensity = 0.5;
		} else {
			// Remove emission
			cell.material.emissive = new THREE.Color(0x000000);
			cell.material.emissiveIntensity = 0;
		}
	}
}

/**
 * Create a floating animation for a cell
 * @param {THREE.Mesh} cell - Cell to animate
 * @returns {Object} Animation object
 */
function createFloatingAnimation2(cell) {
	const originalY = cell.position.y;
	const amplitude = 0.15; // Default amplitude - how high it floats
	const period = 2000 + Math.random() * 2000; // Time for one cycle in ms
	const startTime = performance.now() - Math.random() * 2000; // Random start time for varied motion
	
	return {
		cell,
		amplitude, // Can be adjusted based on whether the cell is part of an island
		originalY,
		update: function(deltaTime) {
			const time = performance.now();
			const phase = ((time - startTime) % period) / period;
			const offset = this.amplitude * Math.sin(phase * Math.PI * 2);
			cell.position.y = originalY + offset;
			
			// Add subtle rotation for more dynamic feel
			cell.rotation.x = Math.sin(phase * Math.PI * 2) * 0.01;
			cell.rotation.z = Math.cos(phase * Math.PI * 2) * 0.01;
		},
		isComplete: false
	};
}

/**
 * Update game entities based on game state
 * @param {Object} gameState - Game state to visualize
 */
export function updateGameEntities(gameState) {
	try {
		if (!scene || !gameState) {
			return false;
		}
		
		// Create cache keys for entities to avoid redundant updates
		const tetrominoKey = gameState.currentTetromino ? 
			JSON.stringify(gameState.currentTetromino) : 'null';
		const ghostKey = gameState.ghostPosition ? 
			JSON.stringify(gameState.ghostPosition) : 'null';
		const chessPiecesKey = gameState.chessPieces ? 
			JSON.stringify(gameState.chessPieces) : 'null';
			
		// Combined key for all entities
		const entitiesKey = `${tetrominoKey}|${ghostKey}|${chessPiecesKey}`;
		
		// If entities haven't changed, skip rendering
		if (entitiesKey === lastEntitiesKey) {
			return true;
		}
		
		// Store current entities key for future comparison
		lastEntitiesKey = entitiesKey;
		
		// Update tetrominos
		updateCurrentTetromino(gameState.currentTetromino);
		
		// Update ghost piece
		updateGhostPiece(gameState.currentTetromino, gameState.ghostPosition);
		
		// Update chess pieces
		updateChessPieces(gameState.chessPieces);
		
		// Only log in debug mode
		if (debugMode) {
			console.log('Game entities updated');
		}
		
		return true;
	} catch (error) {
		console.error('Error updating game entities:', error);
		return false;
	}
}

/**
 * Update current tetromino visualization
 * @param {Object} tetromino - Current tetromino data
 */
function updateCurrentTetromino(tetromino) {
	if (!scene || !tetromino) return;
	
	// Find or create tetromino group
	let tetrominoGroup = scene.getObjectByName('current_tetromino');
	if (!tetrominoGroup) {
		tetrominoGroup = new THREE.Group();
		tetrominoGroup.name = 'current_tetromino';
		scene.add(tetrominoGroup);
	}
	
	// Clear previous tetromino blocks
	while (tetrominoGroup.children.length) {
		const child = tetrominoGroup.children[0];
		tetrominoGroup.remove(child);
		
		if (child.geometry) child.geometry.dispose();
		if (child.material) child.material.dispose();
	}
	
	// Create new tetromino visualization
	const { shape, position, type } = tetromino;
	if (!shape || !position) return;
	
	const cellSize = settings.cellSize || 1;
	const padding = 0.05; // Small gap between blocks
	
	// Get tetromino color
	const colors = {
		'I': 0x00FFFF, // Cyan
		'O': 0xFFFF00, // Yellow
		'T': 0x800080, // Purple
		'S': 0x00FF00, // Green
		'Z': 0xFF0000, // Red
		'J': 0x0000FF, // Blue
		'L': 0xFF7F00, // Orange
		1: 0x00FFFF, // Cyan (I)
		2: 0xFFFF00, // Yellow (O)
		3: 0x800080, // Purple (T)
		4: 0x00FF00, // Green (S)
		5: 0xFF0000, // Red (Z)
		6: 0x0000FF, // Blue (J)
		7: 0xFF7F00  // Orange (L)
	};
	
	const color = colors[type] || 0x888888;
	
	// Create block geometry
	const geometry = new THREE.BoxGeometry(
		cellSize - padding * 2,
		cellSize - padding * 2,
		cellSize - padding * 2
	);
	
	// Create material with slight emission for active piece
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3,
		emissive: new THREE.Color(color),
		emissiveIntensity: 0.2 // Subtle glow
	});
	
	// Create blocks for each cell in the shape
	for (let y = 0; y < shape.length; y++) {
		for (let x = 0; x < shape[y].length; x++) {
			if (shape[y][x]) {
				const block = new THREE.Mesh(geometry, material);
				
				// Position the block
				block.position.set(
					(position.x + x) * cellSize + cellSize / 2,
					(position.z || 0) * cellSize + cellSize / 2, // Height if defined
					(position.y + y) * cellSize + cellSize / 2
				);
				
				block.castShadow = true;
				block.receiveShadow = settings.showShadows;
				
				tetrominoGroup.add(block);
			}
		}
	}
}

/**
 * Update ghost piece visualization
 * @param {Object} tetromino - Current tetromino data
 * @param {Object} ghostPosition - Ghost piece position
 */
function updateGhostPiece(tetromino, ghostPosition) {
	if (!scene || !tetromino || !ghostPosition || !settings.showGhostPiece) return;
	
	// Find or create ghost piece group
	let ghostGroup = scene.getObjectByName('ghost_piece');
	if (!ghostGroup) {
		ghostGroup = new THREE.Group();
		ghostGroup.name = 'ghost_piece';
		scene.add(ghostGroup);
	}
	
	// Clear previous ghost blocks
	while (ghostGroup.children.length) {
		const child = ghostGroup.children[0];
		ghostGroup.remove(child);
		
		if (child.geometry) child.geometry.dispose();
		if (child.material) child.material.dispose();
	}
	
	// Create new ghost visualization
	const { shape, type } = tetromino;
	if (!shape) return;
	
	const cellSize = settings.cellSize || 1;
	const padding = 0.1; // Larger gap for ghost piece
	
	// Get tetromino color but make it transparent
	const colors = {
		'I': 0x00FFFF, // Cyan
		'O': 0xFFFF00, // Yellow
		'T': 0x800080, // Purple
		'S': 0x00FF00, // Green
		'Z': 0xFF0000, // Red
		'J': 0x0000FF, // Blue
		'L': 0xFF7F00, // Orange
		1: 0x00FFFF, // Cyan (I)
		2: 0xFFFF00, // Yellow (O)
		3: 0x800080, // Purple (T)
		4: 0x00FF00, // Green (S)
		5: 0xFF0000, // Red (Z)
		6: 0x0000FF, // Blue (J)
		7: 0xFF7F00  // Orange (L)
	};
	
	const color = colors[type] || 0x888888;
	
	// Create transparent material for ghost
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3,
		transparent: true,
		opacity: 0.3,
		wireframe: true
	});
	
	// Create blocks for each cell in the shape
	for (let y = 0; y < shape.length; y++) {
		for (let x = 0; x < shape[y].length; x++) {
			if (shape[y][x]) {
				// Use wireframe box for ghost piece
				const geometry = new THREE.BoxGeometry(
					cellSize - padding * 2,
					cellSize - padding * 2,
					cellSize - padding * 2
				);
				
				const block = new THREE.Mesh(geometry, material);
				
				// Position the block
				block.position.set(
					(ghostPosition.x + x) * cellSize + cellSize / 2,
					(ghostPosition.z || 0) * cellSize + cellSize / 2, // Height if defined
					(ghostPosition.y + y) * cellSize + cellSize / 2
				);
				
				block.castShadow = false;
				block.receiveShadow = false;
				
				ghostGroup.add(block);
			}
		}
	}
}

/**
 * Update chess pieces visualization
 * @param {Array} chessPieces - Array of chess pieces
 */
function updateChessPieces(chessPieces) {
	if (!scene) return;
	
	// Find or create chess pieces group
	let chessPiecesGroup = scene.getObjectByName('chess_pieces');
	if (!chessPiecesGroup) {
		chessPiecesGroup = new THREE.Group();
		chessPiecesGroup.name = 'chess_pieces';
		scene.add(chessPiecesGroup);
	}
	
	// If no chess pieces, clear the group and return
	if (!chessPieces || chessPieces.length === 0) {
		while (chessPiecesGroup.children.length) {
			const child = chessPiecesGroup.children[0];
			chessPiecesGroup.remove(child);
			
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
		return;
	}
	
	// Track which pieces are still valid
	const validPieceIds = new Set();
	
	// Update or create chess pieces
	for (const piece of chessPieces) {
		if (!piece || !piece.type || !piece.position) continue;
		
		const { id, type, position, player } = piece;
		const pieceId = id || `${type}_${player}_${position.x}_${position.y}`;
		validPieceIds.add(pieceId);
		
		// Find existing piece or create new one
		let chessPiece = chessPiecesGroup.getObjectByName(pieceId);
		
		if (!chessPiece) {
			// Create new chess piece
			chessPiece = createChessPiece(type, player);
			chessPiece.name = pieceId;
			chessPiecesGroup.add(chessPiece);
		}
		
		// Position the piece
		const cellSize = settings.cellSize || 1;
		chessPiece.position.set(
			position.x * cellSize + cellSize / 2,
			(position.height || 0) * cellSize + cellSize, // Slightly elevated
			position.y * cellSize + cellSize / 2
		);
		
		// Add highlight if piece is selected
		if (piece.selected) {
			// Create or update highlight
			let highlight = chessPiece.getObjectByName('highlight');
			if (!highlight) {
				const geometry = new THREE.RingGeometry(cellSize * 0.6, cellSize * 0.8, 16);
				const material = new THREE.MeshBasicMaterial({
					color: 0xFFFF00,
					transparent: true,
					opacity: 0.7,
					side: THREE.DoubleSide
				});
				
				highlight = new THREE.Mesh(geometry, material);
				highlight.name = 'highlight';
				highlight.rotation.x = -Math.PI / 2; // Lay flat
				highlight.position.y = 0.1; // Just above the ground
				
				chessPiece.add(highlight);
			}
		} else {
			// Remove highlight if not selected
			const highlight = chessPiece.getObjectByName('highlight');
			if (highlight) {
				chessPiece.remove(highlight);
				
				if (highlight.geometry) highlight.geometry.dispose();
				if (highlight.material) highlight.material.dispose();
			}
		}
	}
	
	// Remove pieces that are no longer in the game state
	const piecesToRemove = [];
	chessPiecesGroup.traverse(child => {
		if (child !== chessPiecesGroup && !validPieceIds.has(child.name)) {
			piecesToRemove.push(child);
		}
	});
	
	for (const piece of piecesToRemove) {
		chessPiecesGroup.remove(piece);
		
		if (piece.geometry) piece.geometry.dispose();
		if (piece.material) piece.material.dispose();
	}
}

/**
 * Create a chess piece 3D model
 * @param {string} type - Chess piece type
 * @param {number} player - Player number
 * @returns {THREE.Group} Chess piece group
 */
function createChessPiece(type, player) {
	const pieceGroup = new THREE.Group();
	const cellSize = settings.cellSize || 1;
	
	// Determine color based on player
	const color = player === 1 ? 0xFFFFFF : 0x000000;
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3
	});
	
	// Base for all pieces
	const baseGeometry = new THREE.CylinderGeometry(cellSize * 0.3, cellSize * 0.4, cellSize * 0.2, 16);
	const base = new THREE.Mesh(baseGeometry, material);
	base.position.y = cellSize * 0.1;
	pieceGroup.add(base);
	
	// Create piece based on type
	switch (type.toLowerCase()) {
		case 'pawn':
			const pawnUpperGeometry = new THREE.SphereGeometry(cellSize * 0.25, 16, 16);
			const pawnUpper = new THREE.Mesh(pawnUpperGeometry, material);
			pawnUpper.position.y = cellSize * 0.5;
			pieceGroup.add(pawnUpper);
			
			const pawnNeckGeometry = new THREE.CylinderGeometry(cellSize * 0.15, cellSize * 0.25, cellSize * 0.2, 16);
			const pawnNeck = new THREE.Mesh(pawnNeckGeometry, material);
			pawnNeck.position.y = cellSize * 0.3;
			pieceGroup.add(pawnNeck);
			break;
			
		case 'rook':
			const rookBodyGeometry = new THREE.BoxGeometry(cellSize * 0.5, cellSize * 0.5, cellSize * 0.5);
			const rookBody = new THREE.Mesh(rookBodyGeometry, material);
			rookBody.position.y = cellSize * 0.45;
			pieceGroup.add(rookBody);
			
			// Add battlements on top
			for (let i = 0; i < 4; i++) {
				const battlementGeometry = new THREE.BoxGeometry(cellSize * 0.15, cellSize * 0.2, cellSize * 0.15);
				const battlement = new THREE.Mesh(battlementGeometry, material);
				
				// Position at corners
				const offset = cellSize * 0.2;
				switch (i) {
					case 0: battlement.position.set(offset, cellSize * 0.8, offset); break;
					case 1: battlement.position.set(-offset, cellSize * 0.8, offset); break;
					case 2: battlement.position.set(offset, cellSize * 0.8, -offset); break;
					case 3: battlement.position.set(-offset, cellSize * 0.8, -offset); break;
				}
				
				pieceGroup.add(battlement);
			}
			break;
			
		case 'knight':
			// Horse head shape (simplified)
			const knightHeadGeometry = new THREE.ConeGeometry(cellSize * 0.3, cellSize * 0.6, 8);
			const knightHead = new THREE.Mesh(knightHeadGeometry, material);
			knightHead.position.y = cellSize * 0.5;
			knightHead.rotation.z = Math.PI / 6; // Tilt forward
			pieceGroup.add(knightHead);
			
			// Ears
			const earGeometry = new THREE.ConeGeometry(cellSize * 0.1, cellSize * 0.2, 8);
			const ear1 = new THREE.Mesh(earGeometry, material);
			ear1.position.set(cellSize * 0.1, cellSize * 0.7, cellSize * 0.1);
			pieceGroup.add(ear1);
			
			const ear2 = new THREE.Mesh(earGeometry, material);
			ear2.position.set(cellSize * 0.1, cellSize * 0.7, -cellSize * 0.1);
			pieceGroup.add(ear2);
			break;
			
		case 'bishop':
			// Bishop body
			const bishopBodyGeometry = new THREE.ConeGeometry(cellSize * 0.3, cellSize * 0.7, 16);
			const bishopBody = new THREE.Mesh(bishopBodyGeometry, material);
			bishopBody.position.y = cellSize * 0.45;
			pieceGroup.add(bishopBody);
			
			// Top ball
			const bishopTopGeometry = new THREE.SphereGeometry(cellSize * 0.1, 16, 16);
			const bishopTop = new THREE.Mesh(bishopTopGeometry, material);
			bishopTop.position.y = cellSize * 0.9;
			pieceGroup.add(bishopTop);
			
			// Cut on top
			const cutGeometry = new THREE.CylinderGeometry(cellSize * 0.05, cellSize * 0.05, cellSize * 0.1, 16);
			const cut = new THREE.Mesh(cutGeometry, material);
			cut.position.y = cellSize * 0.8;
			pieceGroup.add(cut);
			break;
			
		case 'queen':
			// Queen body
			const queenBodyGeometry = new THREE.CylinderGeometry(cellSize * 0.3, cellSize * 0.4, cellSize * 0.6, 16);
			const queenBody = new THREE.Mesh(queenBodyGeometry, material);
			queenBody.position.y = cellSize * 0.4;
			pieceGroup.add(queenBody);
			
			// Crown
			for (let i = 0; i < 8; i++) {
				const pointGeometry = new THREE.SphereGeometry(cellSize * 0.08, 8, 8);
				const point = new THREE.Mesh(pointGeometry, material);
				
				const angle = (i / 8) * Math.PI * 2;
				const radius = cellSize * 0.25;
				point.position.set(
					Math.cos(angle) * radius,
					cellSize * 0.8,
					Math.sin(angle) * radius
				);
				
				pieceGroup.add(point);
			}
			
			// Top ball
			const queenTopGeometry = new THREE.SphereGeometry(cellSize * 0.15, 16, 16);
			const queenTop = new THREE.Mesh(queenTopGeometry, material);
			queenTop.position.y = cellSize * 0.9;
			pieceGroup.add(queenTop);
			break;
			
		case 'king':
			// King body (similar to queen)
			const kingBodyGeometry = new THREE.CylinderGeometry(cellSize * 0.3, cellSize * 0.4, cellSize * 0.6, 16);
			const kingBody = new THREE.Mesh(kingBodyGeometry, material);
			kingBody.position.y = cellSize * 0.4;
			pieceGroup.add(kingBody);
			
			// Crown
			for (let i = 0; i < 5; i++) {
				const pointGeometry = new THREE.ConeGeometry(cellSize * 0.08, cellSize * 0.15, 8);
				const point = new THREE.Mesh(pointGeometry, material);
				
				const angle = (i / 5) * Math.PI * 2;
				const radius = cellSize * 0.25;
				point.position.set(
					Math.cos(angle) * radius,
					cellSize * 0.8,
					Math.sin(angle) * radius
				);
				
				pieceGroup.add(point);
			}
			
			// Cross on top
			const verticalGeometry = new THREE.BoxGeometry(cellSize * 0.05, cellSize * 0.3, cellSize * 0.05);
			const verticalPart = new THREE.Mesh(verticalGeometry, material);
			verticalPart.position.y = cellSize * 1.05;
			pieceGroup.add(verticalPart);
			
			const horizontalGeometry = new THREE.BoxGeometry(cellSize * 0.2, cellSize * 0.05, cellSize * 0.05);
			const horizontalPart = new THREE.Mesh(horizontalGeometry, material);
			horizontalPart.position.y = cellSize * 1.0;
			pieceGroup.add(horizontalPart);
			break;
			
		default:
			// Generic piece for unknown types
			const genericGeometry = new THREE.SphereGeometry(cellSize * 0.3, 16, 16);
			const genericPiece = new THREE.Mesh(genericGeometry, material);
			genericPiece.position.y = cellSize * 0.5;
			pieceGroup.add(genericPiece);
	}
	
	return pieceGroup;
}

/**
 * Check if the renderer is initialized
 * @returns {boolean} - Whether the renderer is initialized
 */
export function isInitialized() {
	return _isInitialized;
}

/**
 * Render a frame
 * @param {number} timestamp - Current timestamp
 * @returns {boolean} - Whether the render was successful
 */

/**
 * Update debug info for troubleshooting
 */
function updateDebugInfo() {
	try {
		// Create debug panel if it doesn't exist
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
			debugPanel.style.maxWidth = '300px';
			debugPanel.style.maxHeight = '300px';
			debugPanel.style.overflow = 'auto';
			document.body.appendChild(debugPanel);
		}
		
		// Update with current game state info
		let info = '';
		
		// Get basic renderer info
		info += '<strong>Renderer Info</strong><br>';
		info += `Mode: ${is3DMode ? '3D' : '2D'}<br>`;
		info += `Initialized: ${_isInitialized ? 'Yes' : 'No'}<br>`;
		info += `Camera: ${camera ? 'OK' : 'Missing'}<br>`;
		
		// Check what type of controls are being used
		if (controls) {
			if (controls instanceof THREE.OrbitControls) {
				info += `Controls: OrbitControls<br>`;
			} else {
				info += `Controls: Basic<br>`;
			}
		} else {
			info += `Controls: Missing<br>`;
		}
		
		// FPS calculation
		info += `FPS: ${currentFps || 0}<br>`;
		
		// Display camera position if available
		if (camera) {
			info += '<strong>Camera</strong><br>';
			info += `Position X: ${camera.position.x.toFixed(2)}<br>`;
			info += `Position Y: ${camera.position.y.toFixed(2)}<br>`;
			info += `Position Z: ${camera.position.z.toFixed(2)}<br>`;
		}
		
		// Update the debug panel
		debugPanel.innerHTML = info;
	} catch (error) {
		console.error('Error updating debug info:', error);
	}
}



