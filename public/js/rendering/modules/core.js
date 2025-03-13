/**
 * Renderer Core Module
 * Contains core functionality for the renderer
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FogExp2 } from 'three';
import { Constants } from '../../config/constants.js';
import * as GameStateModule from '../../game/gameState.js';
import { SessionManager } from '../../session/sessionManager.js';
import { canPlayerMakeChessMoves } from './utils.js';
import * as EffectsModule from './effects.js';
import { updatePlayerLabels } from './pieces.js';
import { createPlaceholderTexture as createTexture, generateAllTextures } from '../../utils/browser-texture-generator.js';

// Create shorter aliases for frequently used functions
const { createSkybox, addClouds, addCellBottom, addRussianThemeElements } = EffectsModule;
const GameState = GameStateModule; // Alias for compatibility

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
let isInitialized = false;
let movingTetromino;
let animationId = null;
let lastFrameTime = 0;

/**
 * Initialize the renderer
 * @param {HTMLElement} containerElement - DOM container to render into
 * @param {Object} options - Initialization options
 * @returns {Object|false} - Initialization result object or false if failed
 */
export function init(containerElement, options = {}) {
	// Skip if already initialized
	if (isInitialized) {
		console.warn('Renderer already initialized');
		return {
			scene,
			camera,
			renderer,
			controls,
			boardGroup,
			piecesGroup,
			tetrominoGroup,
			ghostGroup,
			decorationsGroup,
			uiGroup,
			materials
		};
	}
	
	// Check if container exists
	if (!containerElement) {
		console.error('Invalid container element provided');
		return false;
	}
	
	container = containerElement;
	
	console.log('Initializing renderer with container dimension:', {
		width: container.clientWidth,
		height: container.clientHeight,
		valid: container.clientWidth > 0 && container.clientHeight > 0
	});
	
	// Create scene - wrap in try/catch
	try {
		scene = new THREE.Scene();
		// IMPORTANT: Set sky blue background color right away
		scene.background = new THREE.Color(0x87CEEB); // Sky blue background
		
		// Make scene globally available for debugging
		window.scene = scene;
		console.log('Scene created successfully');
	} catch (sceneError) {
		console.error('Error creating scene:', sceneError);
		return false;
	}
	
	// Create skybox if enabled
	if (options.enableSkybox) {
		createSkybox(scene);
		addClouds(scene);
	}
	
	// Add Russian theme elements if enabled
	if (options.enableRussianTheme) {
		console.log('Russian theme enabled, adding themed elements');
		addRussianThemeElements(scene);
	}
	
	// Create camera
	try {
		const aspect = container.clientWidth / container.clientHeight;
		camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
		
		// Default camera position (can be overridden by options)
		const cameraOptions = options.cameraOptions || {};
		const cameraPosition = cameraOptions.position || { x: 12, y: 15, z: 20 };
		const cameraLookAt = cameraOptions.lookAt || { x: 12, y: 0, z: 12 };
		
		camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
		camera.lookAt(cameraLookAt.x, cameraLookAt.y, cameraLookAt.z);
		
		// Make camera available globally for debugging
		window.camera = camera;
	} catch (error) {
		console.error('Failed to create camera:', error);
		return false;
	}
	
	// Create renderer - improve error handling here
	try {
		// Check WebGL compatibility first
		if (!window.WebGLRenderingContext) {
			console.error('WebGL not supported in this browser');
			return false;
		}
		
		// Log container dimensions to check if they're valid
		console.log('Container dimensions:', {
			width: container.clientWidth,
			height: container.clientHeight
		});
		
		// Proceed with THREE.js renderer creation
		console.log('Creating WebGLRenderer...');
		
		// Create the renderer with proper options
		try {
			renderer = new THREE.WebGLRenderer({ 
				antialias: true,
				alpha: true
			});
			
			console.log('WebGLRenderer instance created successfully');
		} catch (rendererCreationError) {
			console.error('Error creating WebGLRenderer instance:', rendererCreationError);
			// Attempt fallback renderer
			try {
				console.warn('Trying fallback renderer without antialias...');
				renderer = new THREE.WebGLRenderer({ 
					antialias: false,
					alpha: true 
				});
			} catch (fallbackError) {
				console.error('Fallback renderer also failed:', fallbackError);
				return false;
			}
		}
		
		console.log('Setting renderer size...');
		// Use a minimum size if container dimensions are zero
		const width = Math.max(container.clientWidth, 1);
		const height = Math.max(container.clientHeight, 1);
		
		try {
			renderer.setSize(width, height);
			console.log('Renderer size set successfully');
		} catch (sizeError) {
			console.error('Error setting renderer size:', sizeError);
			return false;
		}
		
		try {
			console.log('Setting pixel ratio...');
			renderer.setPixelRatio(window.devicePixelRatio);
		} catch (ratioError) {
			console.warn('Error setting pixel ratio (non-critical):', ratioError);
			// Continue anyway as this is not critical
		}
		
		try {
			console.log('Enabling shadow maps...');
			renderer.shadowMap.enabled = true;
		} catch (shadowError) {
			console.warn('Error enabling shadow maps (non-critical):', shadowError);
			// Continue anyway as this is not critical
		}
		
		console.log('Appending renderer to container...');
		
		try {
			// Clear any existing content
			while (container.firstChild) {
				container.removeChild(container.firstChild);
			}
			
			// Append the renderer DOM element
			container.appendChild(renderer.domElement);
			console.log('Renderer DOM element appended successfully');
		} catch (appendError) {
			console.error('Error appending renderer to container:', appendError);
			return false;
		}
		
		console.log('WebGL renderer created successfully');
	} catch (rendererError) {
		console.error('Failed to create WebGL renderer:', rendererError);
		console.error('Stack trace:', rendererError.stack);
		return false;
	}
	
	// Continue with the rest of the initialization
	
	// Create groups for organization - add try/catch
	try {
		boardGroup = new THREE.Group();
		piecesGroup = new THREE.Group();
		tetrominoGroup = new THREE.Group();
		ghostGroup = new THREE.Group();
		decorationsGroup = new THREE.Group();
		uiGroup = new THREE.Group();
		
		scene.add(boardGroup);
		scene.add(piecesGroup);
		scene.add(tetrominoGroup);
		scene.add(ghostGroup);
		scene.add(decorationsGroup);
		scene.add(uiGroup);
		
		// Expose for debugging
		window.boardGroup = boardGroup;
		window.piecesGroup = piecesGroup;
		window.tetrominoGroup = tetrominoGroup;
		window.ghostGroup = ghostGroup;
		
		// Create test cells by default in auto test mode
		if (options.useTestMode) {
			console.log('Creating test game world...');
			createTestCells();
		}
	} catch (groupError) {
		console.error('Error creating scene groups:', groupError);
		return false;
	}
	
	// Add orbit controls
	try {
		// Different versions of THREE.js handle OrbitControls differently
		if (typeof THREE.OrbitControls === 'function') {
			// Direct property of THREE
			controls = new THREE.OrbitControls(camera, renderer.domElement);
		} else if (typeof OrbitControls === 'function') {
			// Global OrbitControls (from separate import)
			controls = new OrbitControls(camera, renderer.domElement);
		} else {
			// Fallback - no controls
			console.warn('OrbitControls not available, camera controls disabled');
			console.warn('Using OrbitControls fallback - camera controls will be limited');
		}
		
		// Configure controls
		if (controls) {
			controls.enableDamping = true;
			controls.dampingFactor = 0.05;
			controls.screenSpacePanning = true;
			controls.minDistance = 5;
			controls.maxDistance = 50;
			controls.maxPolarAngle = Math.PI / 2;
		}
		
		// Add camera control functions to window for easy access
		window.resetCamera = function() {
			camera.position.set(12, 15, 20);
			camera.lookAt(12, 0, 12);
			if (controls) controls.update();
		};
		
		window.topView = function() {
		camera.position.set(12, 30, 12);
		camera.lookAt(12, 0, 12);
			if (controls) controls.update();
	};
	
		window.sideView = function() {
			camera.position.set(30, 10, 12);
		camera.lookAt(12, 0, 12);
			if (controls) controls.update();
		};
		
		window.homeView = function() {
			// Focus on the home zone area
			camera.position.set(8, 10, 16);
			camera.lookAt(8, 0, 13);
			if (controls) controls.update();
		};
	} catch (controlsError) {
		console.error('Error setting up controls:', controlsError);
	}
	
	// Share groups with other modules
	window.boardGroup = boardGroup;
	window.piecesGroup = piecesGroup;
	window.tetrominoGroup = tetrominoGroup;
	window.ghostGroup = ghostGroup;
	window.uiGroup = uiGroup;
	window.decorationsGroup = decorationsGroup;
	
	// Add light with try/catch
	try {
		setupLights(scene, options);
	} catch (lightError) {
		console.error('Error setting up lights:', lightError);
		// Continue anyway - non-critical
	}
	
	// Create ground plane with try/catch
	try {
		createGroundPlane();
	} catch (groundError) {
		console.error('Error creating ground plane:', groundError);
		// Continue anyway - non-critical
	}
	
	// Grid helper - DISABLED FOR PRODUCTION
	/*
	try {
		const gridHelper = new THREE.GridHelper(30, 30, 0x444444, 0x222222);
		scene.add(gridHelper);
		console.log('Grid helper added to scene');
	} catch (gridError) {
		console.error('Error creating grid helper:', gridError);
	}
	*/
	
	// Coordinate axes - DISABLED FOR PRODUCTION
	/*
	try {
		createCoordinateAxes();
	} catch (axesError) {
		console.error('Error creating coordinate axes:', axesError);
	}
	*/
	
	// Test cells - DISABLED FOR PRODUCTION
	/*
	try {
		createTestCells();
	} catch (cellsError) {
		console.error('Error creating test cells:', cellsError);
	}
	*/
	
	// Add fog if not in test mode with reduced density
	scene.fog = new FogExp2(0x111133, options.useTestMode ? 0.0005 : 0.002);
	
	// Load textures
	if (options.textureLoader) {
		window.TEXTURE_LOADER = options.textureLoader;
	}
	loadTextures(options);
	
	// Handle window resize
	window.addEventListener('resize', onWindowResize);
	
	// Comment out debug UI in production
	// createDebugUI();
	
	// Create a moving tetromino to demonstrate animation
	function createMovingTetromino() {
		console.log('Creating moving tetromino for animation...');
		movingTetromino = new THREE.Group();
		
		// Create a T-shaped tetromino with a bright color
		const blockGeometry = new THREE.BoxGeometry(2, 2, 2);
		const blockMaterial = new THREE.MeshPhongMaterial({ 
			color: 0xff3300,
			emissive: 0x441100,
			shininess: 30
		});
		
		// T-shape positions
		const positions = [
			{ x: 0, y: 0, z: 0 },  // center
			{ x: -1, y: 0, z: 0 }, // left
			{ x: 1, y: 0, z: 0 },  // right
			{ x: 0, y: 0, z: 1 }   // bottom
		];
		
		positions.forEach(pos => {
			const block = new THREE.Mesh(blockGeometry, blockMaterial);
			block.position.set(pos.x * 2.2, pos.y * 2.2, pos.z * 2.2);
			block.castShadow = true;
			block.receiveShadow = true;
			movingTetromino.add(block);
		});
		
		// Position the tetromino in mid-air
		movingTetromino.position.set(10, 15, 10);
		scene.add(movingTetromino);
		
		console.log('Moving tetromino created successfully');
		return movingTetromino;
	}
	
	// Comment out to remove test tetromino from main view
	// createMovingTetromino();
	
	// Animation loop
	function animate(time) {
		// Request next frame early to maintain animation even if an error occurs
		const animationId = requestAnimationFrame(animate);
		
		try {
			// Calculate delta time for animations
			const delta = (time - lastTime) / 1000;
			lastTime = time;
			
			// Update controls if they exist
			if (controls && typeof controls.update === 'function') {
				controls.update();
			}
			
			// Animate the moving tetromino if it exists
			if (movingTetromino) {
				// Simple animation: bob up and down slightly
				movingTetromino.rotation.y += delta * 0.5; // Rotate slowly
				
				// Random slight movement for visual interest
				movingTetromino.position.y += Math.sin(time * 0.001) * 0.01;
			}
			
			// Animate particles and potions if the effects module is available
			try {
				if (typeof EffectsModule.animatePotionsAndParticles === 'function') {
					EffectsModule.animatePotionsAndParticles(delta);
				}
			} catch (effectsError) {
				// Non-critical error, just log it
				console.warn('Error animating effects:', effectsError);
			}
			
			// Render the scene
			if (renderer && scene && camera) {
				renderer.render(scene, camera);
			}
		} catch (error) {
			// Log the error but don't cancel the animation loop
			console.error('Error in animation loop:', error);
			console.error(error.stack);
		}
	}
	
	// Start animation loop
	animate(0);
	
	// Initialize game state
	if (typeof GameState !== 'undefined' && typeof GameState.initGameState === 'function') {
		console.log('Session initialized:', SessionManager.initSession());
		console.log('Initializing default game state for rendering');
		
		try {
			const gameState = GameState.initGameState();
			console.log('Game state initialized:', gameState);
			
			// Initialize the game world with the current player
			if (SessionManager.getSessionData() && SessionManager.getSessionData().playerId) {
				initializeGameWorld(SessionManager.getSessionData().playerId);
			}
		} catch (e) {
			console.error('Failed to initialize game state:', e);
		}
	}
	
	// Set initialized flag
	isInitialized = true;
	
	// Print success message and help text
	console.log('Renderer initialized successfully. To adjust the camera view:');
	console.log('- Use window.resetCamera() to reset the camera position');
	console.log('- Use window.topView() for a bird\'s eye view');
	console.log('- Use window.sideView() for a side view');
	console.log('- Use window.homeView() to focus on the home zone');
	
	// Create test cells if in test mode or debug mode
	if (options.useTestMode || options.debug) {
		console.log('Creating test game environment...');
		createTestCells();
	}
	
	// Start the animation loop
	animate(0);
	
	return {
		scene, camera, renderer, controls,
		boardGroup, piecesGroup, tetrominoGroup, ghostGroup, decorationsGroup,
		materials
	};
}

/**
 * Creates a ground plane for orientation
 */
function createGroundPlane() {
	// Create a large ground plane for orientation
	const groundGeometry = new THREE.PlaneGeometry(100, 100);
	const groundMaterial = new THREE.MeshBasicMaterial({
		color: 0x222222,
		side: THREE.DoubleSide,
		transparent: true,
		opacity: 0.5,
		wireframe: true
	});
	
	const ground = new THREE.Mesh(groundGeometry, groundMaterial);
	ground.rotation.x = Math.PI / 2; // Make horizontal
	ground.position.y = -0.1; // Slightly below zero
	
	// Add numbers at key positions
	for (let x = 0; x <= 20; x += 5) {
		for (let z = 0; z <= 20; z += 5) {
			const label = createTextLabel(`${x},${z}`, x, 0.1, z, 0xFFFFFF);
			scene.add(label);
		}
	}
	
	scene.add(ground);
}

/**
 * Creates coordinate axes for orientation
 */
function createCoordinateAxes() {
	// Create X axis (red)
	const xAxisGeometry = new THREE.BoxGeometry(20, 0.1, 0.1);
	const xAxisMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
	const xAxis = new THREE.Mesh(xAxisGeometry, xAxisMaterial);
	xAxis.position.set(10, 0, 0);
	scene.add(xAxis);
	
	// Create Z axis (blue)
	const zAxisGeometry = new THREE.BoxGeometry(0.1, 0.1, 20);
	const zAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x0000FF });
	const zAxis = new THREE.Mesh(zAxisGeometry, zAxisMaterial);
	zAxis.position.set(0, 0, 10);
	scene.add(zAxis);
	
	// Create Y axis (green)
	const yAxisGeometry = new THREE.BoxGeometry(0.1, 20, 0.1);
	const yAxisMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
	const yAxis = new THREE.Mesh(yAxisGeometry, yAxisMaterial);
	yAxis.position.set(0, 10, 0);
	scene.add(yAxis);
	
	// Add axis labels
	const xLabel = createTextLabel("X", 20, 0.5, 0, 0xFF0000);
	const yLabel = createTextLabel("Y", 0, 20, 0, 0x00FF00);
	const zLabel = createTextLabel("Z", 0, 0.5, 20, 0x0000FF);
	
	scene.add(xLabel);
	scene.add(yLabel);
	scene.add(zLabel);
}

/**
 * Create a text label sprite
 */
function createTextLabel(text, x, y, z, color = 0xFFFFFF) {
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 128;
	const ctx = canvas.getContext('2d');
	
	// Background
	ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	// Text
	ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
	ctx.font = 'bold 48px Arial';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, canvas.width/2, canvas.height/2);
	
	// Create sprite
	const texture = new THREE.CanvasTexture(canvas);
	const material = new THREE.SpriteMaterial({ map: texture });
	const sprite = new THREE.Sprite(material);
	sprite.position.set(x, y, z);
	sprite.scale.set(2, 1, 1);
	
	return sprite;
}

/**
 * Set up scene lights
 * @param {THREE.Scene} scene - The scene to add lights to
 * @param {Object} options - Options for lights
 */
function setupLights(scene, options = {}) {
	try {
		// Add ambient light
		const ambientLight = new THREE.AmbientLight(0xcccccc, 0.4);
	scene.add(ambientLight);
	
		// Add main directional light (sun)
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
		directionalLight.position.set(5, 10, 7);
	directionalLight.castShadow = true;
	
		// Configure shadow properties
		if (directionalLight.shadow) {
			directionalLight.shadow.mapSize.width = 2048;
			directionalLight.shadow.mapSize.height = 2048;
			directionalLight.shadow.camera.near = 0.5;
			directionalLight.shadow.camera.far = 50;
			directionalLight.shadow.camera.left = -15;
			directionalLight.shadow.camera.right = 15;
			directionalLight.shadow.camera.top = 15;
			directionalLight.shadow.camera.bottom = -15;
		}
		
	scene.add(directionalLight);
	
		// Only add helper in debug mode and if DirectionalLightHelper exists
		if (options.debug && typeof THREE.DirectionalLightHelper === 'function') {
			try {
				const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
				scene.add(lightHelper);
			} catch (helperError) {
				console.warn('Could not create light helper:', helperError);
				// Continue without helpers - non-critical
			}
		}
		
		// Add a secondary light for better illumination
		const secondaryLight = new THREE.DirectionalLight(0xaaaaff, 0.3);
		secondaryLight.position.set(-10, 5, -10);
		scene.add(secondaryLight);
		
		console.log('Lights set up successfully');
	} catch (error) {
		console.error('Error setting up lights:', error);
		
		// Add a basic light as fallback
		try {
			const fallbackLight = new THREE.AmbientLight(0xffffff, 1.0);
			scene.add(fallbackLight);
			console.log('Added fallback lighting');
		} catch (fallbackError) {
			console.error('Failed to add fallback lighting:', fallbackError);
		}
	}
}

/**
 * Load textures needed for the renderer
 */
function loadTextures(options = {}) {
	// Get texture paths from constants or globals
	const texturePaths = options.texturePaths ||
		window.TEXTURE_PATHS ||
		(window.Constants && window.Constants.TEXTURE_PATHS) ||
		{
			board: './img/textures/board.png',
			cell: './img/textures/cell.png',
			homeZone: './img/textures/home_zone.png'
		};
	
	console.log('Using texture paths:', texturePaths);
	
	// Async function to load a texture with fallback
	const loadTextureWithFallback = (textureKey, fallbackColor) => {
		return new Promise((resolve) => {
			const path = texturePaths[textureKey];
			
			if (!path) {
				console.warn(`No path defined for texture: ${textureKey}`);
				const placeholderTexture = createPlaceholderTexture(
					textureKey,
					512,
					512,
					fallbackColor
				);
				materials[textureKey] = placeholderTexture;
				resolve(placeholderTexture);
				return;
			}
			
			console.log(`Loading texture: ${path}`);
			
			// Use either the provided texture loader or the global one
			const textureLoader = options.textureLoader ||
				window.TEXTURE_LOADER ||
				new THREE.TextureLoader();
			
			// Load the texture with error fallback
			const texture = textureLoader.load(
				path,
				(loadedTexture) => {
					console.log(`Successfully loaded texture: ${path}`);
					materials[textureKey] = loadedTexture;
					resolve(loadedTexture);
				},
				undefined, // onProgress is not used
				(error) => {
					console.warn(`Error loading texture ${path}:`, error);
					const placeholderTexture = createPlaceholderTexture(
						textureKey,
						512,
						512,
						fallbackColor
					);
					materials[textureKey] = placeholderTexture;
					resolve(placeholderTexture);
				}
			);
			
			return texture;
		});
	};
	
	// Try to load textures, but if they fail, generate them on the fly
	try {
		// First try to load all textures in parallel with different fallback colors
		return Promise.all([
			loadTextureWithFallback('board', '#5d4037'), // Brown for board
			loadTextureWithFallback('cell', '#42a5f5'), // Blue for cells
			loadTextureWithFallback('homeZone', '#7986cb') // Indigo for home zone
		]).then(() => {
			console.log('All textures loaded');
			return materials;
		}).catch((error) => {
			console.error('Error loading textures:', error);
			// If loading fails, generate all textures at once
			return generateAllTextures(materials);
		});
	} catch (error) {
		console.error('Error in texture loading process:', error);
		// Fallback to generating all textures
		return generateAllTextures(materials);
	}
}

/**
 * Handle window resize
 */
function onWindowResize() {
	if (!camera || !renderer || !container) return;
	
	// Update camera aspect ratio
	camera.aspect = container.clientWidth / container.clientHeight;
	camera.updateProjectionMatrix();
	
	// Update renderer size
	renderer.setSize(container.clientWidth, container.clientHeight);
}

/**
 * Initialize the game world with a player
 * @param {string} playerId - The player's ID
 */
export function initializeGameWorld(playerId) {
	try {
		console.log('Initializing game world with player:', playerId);
		
		// Get the actual game state from GameState
		let gameState;
		
		// Try different ways to get the game state
		try {
			if (window.GameState && typeof window.GameState.getGameState === 'function') {
				gameState = window.GameState.getGameState();
			} else if (typeof GameState !== 'undefined' && typeof GameState.getGameState === 'function') {
				gameState = GameState.getGameState();
			} else {
				// If no game state available, create a minimal test state
				console.warn('No GameState found, creating minimal test state');
				gameState = {
					board: {},
					players: {
						[playerId]: {
							id: playerId,
							color: 0xFFFFFF,
							pieces: []
						}
					}
				};
			}
		} catch (error) {
			console.error('Error accessing GameState:', error);
			// Create fallback minimal game state
			gameState = {
				board: {},
				players: {
					[playerId]: {
						id: playerId,
						color: 0xFFFFFF,
						pieces: []
					}
				}
			};
		}
		
		console.log('Game state loaded:', gameState);
		
		// Clear any existing board elements
		while (boardGroup.children.length > 0) {
			boardGroup.remove(boardGroup.children[0]);
		}
		
		// Clear any existing pieces
		while (piecesGroup.children.length > 0) {
			piecesGroup.remove(piecesGroup.children[0]);
		}
		
		const cellSize = 2.5; // Size of each cell
		
		// Render the board cells based on game state
		if (gameState.board) {
			console.log('Rendering board cells from game state...');
			
			// Process each cell in the board
			Object.entries(gameState.board).forEach(([key, cell]) => {
				if (!cell) return;
				
				// Parse coordinates from key (format: "x,y")
				const [x, y] = key.split(',').map(Number);
				
				// Create a cell
				const cellGeometry = new THREE.BoxGeometry(cellSize, 0.2 * cellSize, cellSize);
				
				// Choose appropriate material based on cell type
				let material;
				if (cell.isHomeZone) {
					// Home zone cell
					if (materials && materials.homeZone) {
						material = materials.homeZone.clone();
					} else {
						material = new THREE.MeshLambertMaterial({ color: 0xFFD700 }); // Gold for home zone
					}
				} else {
					// Regular cell
					if (materials && materials.cell) {
						material = materials.cell.clone();
					} else {
						material = new THREE.MeshLambertMaterial({ color: 0x888888 }); // Grey for regular cells
					}
				}
				
				const cellMesh = new THREE.Mesh(cellGeometry, material);
				cellMesh.position.set(
					x * cellSize, 
					0, 
					y * cellSize
				);
				cellMesh.receiveShadow = true;
				
				// Add user data for reference and interaction
				cellMesh.userData = {
					isHomeZone: cell.isHomeZone || false,
					playerId: cell.playerId,
					boardX: x,
					boardY: y
				};
				
				boardGroup.add(cellMesh);
			});
			
			console.log(`Rendered ${boardGroup.children.length} board cells`);
		}
		
		// Render chess pieces based on game state
		if (gameState.players) {
			console.log('Rendering chess pieces from game state...');
			
			// Process players
			Object.entries(gameState.players).forEach(([id, player]) => {
				if (!player.pieces) return;
				
				// Process each piece
				player.pieces.forEach(piece => {
					// Determine piece color from player id
					const pieceColor = player.color || (player.id === playerId ? 0xFFFFFF : 0x222222);
					
					renderChessPiece(piece.type, pieceColor, piece.x, piece.y, id);
				});
			});
			
			console.log(`Rendered ${piecesGroup.children.length} chess pieces`);
		}
		
		// Render falling tetromino if present
		if (gameState.fallingPiece) {
			console.log('Rendering falling tetromino...');
			// Use window method or imported function
			if (typeof window.updateFallingTetromino === 'function') {
				window.updateFallingTetromino(gameState.fallingPiece);
			} else {
				console.warn('updateFallingTetromino function not available');
			}
		}
		
		// Render ghost piece if present
		if (gameState.ghostPiece) {
			console.log('Rendering ghost piece...');
			// Use window method or imported function
			if (typeof window.updateGhostPiece === 'function') {
				window.updateGhostPiece(gameState.ghostPiece);
			} else {
				console.warn('updateGhostPiece function not available');
			}
		}
		
		// Set camera to view the active board area
		if (camera && controls) {
			// Find a reasonable center point and view distance
			const boardCenter = calculateBoardCenter(gameState);
			
			camera.position.set(
				boardCenter.x, 
				15, // Height above board
				boardCenter.z + 15 // Position behind center
			);
			camera.lookAt(boardCenter.x, 0, boardCenter.z);
			
			if (controls.target) {
				controls.target.set(boardCenter.x, 0, boardCenter.z);
				controls.update();
			}
			
			console.log('Camera positioned to view board at:', boardCenter);
		}
		
		console.log('Game world initialized successfully');
	} catch (error) {
		console.error('Error initializing game world:', error);
	}
}

/**
 * Helper function to render a chess piece
 * @param {string} type - The type of chess piece (pawn, rook, etc.)
 * @param {number} color - The color of the piece
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @param {string} playerId - The ID of the player who owns the piece
 */
function renderChessPiece(type, color, x, y, playerId) {
	const cellSize = 2.5;
	let geometry;
	
	switch(type.toLowerCase()) {
		case 'pawn':
			geometry = new THREE.CylinderGeometry(0.4 * cellSize, 0.5 * cellSize, cellSize, 8);
			break;
		case 'rook':
			geometry = new THREE.BoxGeometry(0.8 * cellSize, 1.2 * cellSize, 0.8 * cellSize);
			break;
		case 'knight':
			// Create a simple knight shape
			const knightGroup = new THREE.Group();
			const base = new THREE.Mesh(
				new THREE.CylinderGeometry(0.5 * cellSize, 0.6 * cellSize, 0.6 * cellSize, 8),
				new THREE.MeshLambertMaterial({ color: color })
			);
			const top = new THREE.Mesh(
				new THREE.SphereGeometry(0.4 * cellSize, 8, 8),
				new THREE.MeshLambertMaterial({ color: color })
			);
			top.position.y = 0.6 * cellSize;
			knightGroup.add(base);
			knightGroup.add(top);
			
			knightGroup.position.set(
				x * cellSize,
				0.6 * cellSize,
				y * cellSize
			);
			knightGroup.castShadow = true;
			
			// Add player data
			knightGroup.userData = {
				type: 'knight',
				isWhite: (color === 0xFFFFFF),
				playerId: playerId,
				boardX: x,
				boardY: y
			};
			
			piecesGroup.add(knightGroup);
			return;
		case 'bishop':
			geometry = new THREE.ConeGeometry(0.5 * cellSize, 1.2 * cellSize, 8);
			break;
		case 'queen':
			geometry = new THREE.CylinderGeometry(0.4 * cellSize, 0.6 * cellSize, 1.4 * cellSize, 8);
			break;
		case 'king':
			// Create king with a cross on top
			const kingGroup = new THREE.Group();
			
			// Base
			const kingBase = new THREE.Mesh(
				new THREE.CylinderGeometry(0.25, 0.4, 0.8, 12),
				new THREE.MeshLambertMaterial({ color: color })
			);
			
			// Cross
			const crossVertical = new THREE.Mesh(
				new THREE.BoxGeometry(0.1, 0.3, 0.1),
				new THREE.MeshLambertMaterial({ color: color })
			);
			crossVertical.position.y = 0.55;
			
			const crossHorizontal = new THREE.Mesh(
				new THREE.BoxGeometry(0.3, 0.1, 0.1),
				new THREE.MeshLambertMaterial({ color: color })
			);
			crossHorizontal.position.y = 0.45;
			
			kingGroup.add(kingBase);
			kingGroup.add(crossVertical);
			kingGroup.add(crossHorizontal);
			
			// Add wireframe for better visibility
			try {
				let kingWireframe1, kingWireframe2, kingWireframe3;
				
				if (typeof THREE.EdgesGeometry === 'function') {
					// Use EdgesGeometry if available
					kingWireframe1 = new THREE.LineSegments(
						new THREE.EdgesGeometry(kingBase.geometry),
						new THREE.LineBasicMaterial({ color: 0x000000 })
					);
					kingWireframe2 = new THREE.LineSegments(
						new THREE.EdgesGeometry(crossVertical.geometry),
						new THREE.LineBasicMaterial({ color: 0x000000 })
					);
					kingWireframe3 = new THREE.LineSegments(
						new THREE.EdgesGeometry(crossHorizontal.geometry),
						new THREE.LineBasicMaterial({ color: 0x000000 })
					);
				} else {
					// Fallback to WireframeGeometry
					kingWireframe1 = new THREE.LineSegments(
						new THREE.WireframeGeometry(kingBase.geometry),
						new THREE.LineBasicMaterial({ color: 0x000000 })
					);
					kingWireframe2 = new THREE.LineSegments(
						new THREE.WireframeGeometry(crossVertical.geometry),
						new THREE.LineBasicMaterial({ color: 0x000000 })
					);
					kingWireframe3 = new THREE.LineSegments(
						new THREE.WireframeGeometry(crossHorizontal.geometry),
						new THREE.LineBasicMaterial({ color: 0x000000 })
					);
				}
				
				kingWireframe2.position.copy(crossVertical.position);
				kingWireframe3.position.copy(crossHorizontal.position);
				
				kingGroup.add(kingWireframe1);
				kingGroup.add(kingWireframe2);
				kingGroup.add(kingWireframe3);
			} catch (error) {
				console.warn('Could not create wireframe for king:', error);
				// Continue without wireframe
			}
			
			// Position the king
			kingGroup.position.set(x + 0.5, 0.4, z + 0.5);
			
			// Add to pieces group
			piecesGroup.add(kingGroup);
			return;
		default:
			geometry = new THREE.SphereGeometry(0.6 * cellSize, 8, 8);
	}
	
	const material = new THREE.MeshLambertMaterial({ color: color });
	const piece = new THREE.Mesh(geometry, material);
	piece.position.set(
		x * cellSize,
		0.6 * cellSize,
		y * cellSize
	);
	piece.castShadow = true;
	
	// Add player data
	piece.userData = {
		type: type,
		isWhite: (color === 0xFFFFFF),
		playerId: playerId,
		boardX: x,
		boardY: y
	};
	
	piecesGroup.add(piece);
}

/**
 * Calculate the center of the board based on game state
 * @param {Object} gameState - The current game state
 * @returns {Object} The center position {x, y, z}
 */
function calculateBoardCenter(gameState) {
	if (!gameState || !gameState.board || !Array.isArray(gameState.board)) {
		// Default center if no valid game state
		return { x: 12, y: 0, z: 12 };
	}
	
	// Find min and max coordinates of active cells
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	let activeCellCount = 0;
	
	// Scan the board
	for (let y = 0; y < gameState.board.length; y++) {
		const row = gameState.board[y];
		if (!row || !Array.isArray(row)) continue;
		
		for (let x = 0; x < row.length; x++) {
			const cell = row[x];
			if (cell && cell.active) {
		minX = Math.min(minX, x);
		maxX = Math.max(maxX, x);
		minY = Math.min(minY, y);
		maxY = Math.max(maxY, y);
				activeCellCount++;
			}
		}
	}
	
	// If no valid coordinates found or if we get invalid values, use defaults
	if (minX === Infinity || maxX === -Infinity || 
		minY === Infinity || maxY === -Infinity ||
		isNaN(minX) || isNaN(maxX) || isNaN(minY) || isNaN(maxY)) {
		return { x: 12, y: 0, z: 12 };
	}
	
	// Calculate center
	const centerX = (minX + maxX) / 2 * (gameState.cellSize || 1);
	const centerZ = (minY + maxY) / 2 * (gameState.cellSize || 1);
	
	// Return coordinates with some validation
	return {
		x: isFinite(centerX) ? centerX : 12,
		y: 0,
		z: isFinite(centerZ) ? centerZ : 12
	};
}

/**
 * Cleanup function
 */
export function cleanup() {
	// Remove event listener
	window.removeEventListener('resize', onWindowResize);
	
	// Remove renderer
	if (renderer && container) {
		container.removeChild(renderer.domElement);
	}
	
	// Reset variables
	container = null;
	scene = null;
	camera = null;
	renderer = null;
	controls = null;
	boardGroup = null;
	piecesGroup = null;
	tetrominoGroup = null;
	uiGroup = null;
	decorationsGroup = null;
	ghostGroup = null;
	materials = {};
	lastTime = 0;
	
	isInitialized = false;
	
	console.log('Renderer cleaned up');
}

/**
 * Create visible test cells in the board area
 */
function createTestCells() {
	console.log('Creating test cells for visualization...');
	
	// Make the test cells more visible and larger
	const cellSize = 1;
	const boardSize = 16;
	
	// Create a properly sized board
	for (let x = 0; x < boardSize; x++) {
		for (let z = 0; z < boardSize; z++) {
			const isEven = (x + z) % 2 === 0;
			const material = new THREE.MeshLambertMaterial({
				color: isEven ? 0x888888 : 0x444444,
				transparent: true,
				opacity: 0.9
			});
			const geometry = new THREE.BoxGeometry(cellSize, 0.2, cellSize);
			const cell = new THREE.Mesh(geometry, material);
			
			// Position cells to form a grid
			cell.position.x = x * cellSize;
			cell.position.z = z * cellSize;
			cell.position.y = 0;
			
			// Add wireframe for better visibility
			try {
				let wireframe;
				if (typeof THREE.EdgesGeometry === 'function') {
					// Use EdgesGeometry if available
					wireframe = new THREE.LineSegments(
						new THREE.EdgesGeometry(geometry),
						new THREE.LineBasicMaterial({ color: 0xffffff })
					);
				} else {
					// Fallback to WireframeGeometry which is more widely supported
					wireframe = new THREE.LineSegments(
						new THREE.WireframeGeometry(geometry),
						new THREE.LineBasicMaterial({ color: 0xffffff })
					);
				}
				cell.add(wireframe);
			} catch (error) {
				console.warn('Could not create wireframe for cell:', error);
				// Continue without wireframe
			}
			
			// Add coordinate labels for debugging
			const label = createTextLabel(`${x},${z}`, x * cellSize, 0.3, z * cellSize, 0xffffff);
			boardGroup.add(label);
			
			boardGroup.add(cell);
		}
	}
	
	// Create a designated home zone area (8x2 section)
	const homeZoneX = 4;
	const homeZoneZ = 12;
	
	// Mark home zone with special colored cells
	for (let x = homeZoneX; x < homeZoneX + 8; x++) {
		for (let z = homeZoneZ; z < homeZoneZ + 2; z++) {
			// Create a home zone tile
			const geometry = new THREE.BoxGeometry(cellSize, 0.3, cellSize);
			const material = new THREE.MeshLambertMaterial({
				color: 0xFF8C00, // Orange for home zone
				transparent: true,
				opacity: 0.8
			});
			const homeCell = new THREE.Mesh(geometry, material);
			
			homeCell.position.x = x * cellSize;
			homeCell.position.z = z * cellSize;
			homeCell.position.y = 0.1; // Slightly above the board
			
			// Add wireframe for better visibility
			try {
				let wireframe;
				if (typeof THREE.EdgesGeometry === 'function') {
					// Use EdgesGeometry if available
					wireframe = new THREE.LineSegments(
						new THREE.EdgesGeometry(geometry),
						new THREE.LineBasicMaterial({ color: 0xffffff })
					);
				} else {
					// Fallback to WireframeGeometry which is more widely supported
					wireframe = new THREE.LineSegments(
						new THREE.WireframeGeometry(geometry),
						new THREE.LineBasicMaterial({ color: 0xffffff })
					);
				}
				homeCell.add(wireframe);
			} catch (error) {
				console.warn('Could not create wireframe for home cell:', error);
				// Continue without wireframe
			}
			
			boardGroup.add(homeCell);
		}
	}
	
	// Add chess pieces to the home zone
	createChessPieces(homeZoneX, homeZoneZ);
	
	// Create a falling tetromino
	createTetromino();
	
	// Add lighting specific to the test environment
	const ambientLight = new THREE.AmbientLight(0xcccccc, 0.4);
	scene.add(ambientLight);
	
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
	directionalLight.position.set(5, 10, 7);
	directionalLight.castShadow = true;
	scene.add(directionalLight);
}

// Create chess pieces for the test environment
function createChessPieces(startX, startZ) {
	// Chess piece types for back row
	const backRow = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
	
	// Add pieces to back row
	for (let i = 0; i < 8; i++) {
		const pieceType = backRow[i];
		createChessPiece(pieceType, 0xDDDDDD, startX + i, startZ);
	}
	
	// Add pawns to front row
	for (let i = 0; i < 8; i++) {
		createChessPiece('pawn', 0xDDDDDD, startX + i, startZ + 1);
	}
}

// Create a tetromino for the test environment
function createTetromino() {
	// T-shape tetromino
	const tetrominoBlocks = [
		{ x: 0, z: 0 },
		{ x: -1, z: 0 },
		{ x: 1, z: 0 },
		{ x: 0, z: 1 }
	];
	
	const blockSize = 0.95;
	const blockGeometry = new THREE.BoxGeometry(blockSize, blockSize, blockSize);
	const blockMaterial = new THREE.MeshLambertMaterial({ color: 0xAA00AA });
	
	// Create group for the tetromino
	const tetrominoPiece = new THREE.Group();
	tetrominoPiece.position.set(8, 5, 8); // Position above the board
	
	// Create blocks for the tetromino
	tetrominoBlocks.forEach(block => {
		const mesh = new THREE.Mesh(blockGeometry, blockMaterial);
		mesh.position.set(block.x, 0, block.z);
		
		// Add wireframe for visibility
		try {
			let wireframe;
			if (typeof THREE.EdgesGeometry === 'function') {
				// Use EdgesGeometry if available
				wireframe = new THREE.LineSegments(
					new THREE.EdgesGeometry(blockGeometry),
					new THREE.LineBasicMaterial({ color: 0xffffff })
				);
			} else {
				// Fallback to WireframeGeometry which is more widely supported
				wireframe = new THREE.LineSegments(
					new THREE.WireframeGeometry(blockGeometry),
					new THREE.LineBasicMaterial({ color: 0xffffff })
				);
			}
			mesh.add(wireframe);
		} catch (error) {
			console.warn('Could not create wireframe for tetromino block:', error);
			// Continue without wireframe
		}
		
		tetrominoPiece.add(mesh);
	});
	
	// Add to the tetromino group
	tetrominoGroup.add(tetrominoPiece);
	movingTetromino = tetrominoPiece;
	
	// Add animation for the tetromino
	function animateTetromino() {
		if (movingTetromino) {
			// Move down slowly
			movingTetromino.position.y -= 0.03;
			
			// Reset when it gets too low
			if (movingTetromino.position.y < -2) {
				movingTetromino.position.y = 5;
				// Randomize X position a bit
				movingTetromino.position.x = 4 + Math.random() * 8;
			}
		}
		
		requestAnimationFrame(animateTetromino);
	}
	
	animateTetromino();
}

/**
 * Create a chess piece for testing
 * @param {string} type - The type of chess piece (e.g., 'pawn', 'rook')
 * @param {number} color - The color of the piece
 * @param {number} x - The x position on the board
 * @param {number} z - The z position on the board
 */
function createChessPiece(type, color, x, z) {
	// Choose geometry based on piece type
		let geometry;
	let height = 1.0;
		
		switch(type) {
			case 'pawn':
			geometry = new THREE.CylinderGeometry(0.2, 0.3, 0.6, 12);
			height = 0.6;
				break;
			case 'rook':
			geometry = new THREE.BoxGeometry(0.4, 0.8, 0.4);
			height = 0.8;
				break;
			case 'knight':
				// Create a simple knight shape
				const knightGroup = new THREE.Group();
			
			// Base
				const base = new THREE.Mesh(
				new THREE.CylinderGeometry(0.25, 0.3, 0.4, 12),
					new THREE.MeshLambertMaterial({ color: color })
				);
			
			// Top part (horse head representation)
				const top = new THREE.Mesh(
				new THREE.BoxGeometry(0.2, 0.4, 0.3),
					new THREE.MeshLambertMaterial({ color: color })
				);
			top.position.set(0, 0.4, -0.1);
			
				knightGroup.add(base);
				knightGroup.add(top);
				
			// Add wireframe for better visibility
				try {
					let knightWireframe1, knightWireframe2;
					
					if (typeof THREE.EdgesGeometry === 'function') {
						// Use EdgesGeometry if available
						knightWireframe1 = new THREE.LineSegments(
							new THREE.EdgesGeometry(base.geometry),
							new THREE.LineBasicMaterial({ color: 0x000000 })
						);
						knightWireframe2 = new THREE.LineSegments(
							new THREE.EdgesGeometry(top.geometry),
							new THREE.LineBasicMaterial({ color: 0x000000 })
						);
					} else {
						// Fallback to WireframeGeometry
						knightWireframe1 = new THREE.LineSegments(
							new THREE.WireframeGeometry(base.geometry),
							new THREE.LineBasicMaterial({ color: 0x000000 })
						);
						knightWireframe2 = new THREE.LineSegments(
							new THREE.WireframeGeometry(top.geometry),
							new THREE.LineBasicMaterial({ color: 0x000000 })
						);
					}
					
					knightWireframe2.position.copy(top.position);
					knightGroup.add(knightWireframe1);
					knightGroup.add(knightWireframe2);
				} catch (error) {
					console.warn('Could not create wireframe for knight:', error);
					// Continue without wireframe
				}
				
				// Position the piece
				knightGroup.position.set(x + 0.5, 0.3, z + 0.5);
				
				// Add to the pieces group
				piecesGroup.add(knightGroup);
				return;
			case 'bishop':
				geometry = new THREE.ConeGeometry(0.3, 0.9, 12);
				height = 0.9;
				break;
			case 'queen':
				geometry = new THREE.CylinderGeometry(0.2, 0.4, 1.0, 12);
				height = 1.0;
				break;
			case 'king':
				// Create king with a cross on top
				const kingGroup = new THREE.Group();
				
				// Base
				const kingBase = new THREE.Mesh(
					new THREE.CylinderGeometry(0.25, 0.4, 0.8, 12),
					new THREE.MeshLambertMaterial({ color: color })
				);
				
				// Cross
				const crossVertical = new THREE.Mesh(
					new THREE.BoxGeometry(0.1, 0.3, 0.1),
					new THREE.MeshLambertMaterial({ color: color })
				);
				crossVertical.position.y = 0.55;
				
				const crossHorizontal = new THREE.Mesh(
					new THREE.BoxGeometry(0.3, 0.1, 0.1),
					new THREE.MeshLambertMaterial({ color: color })
				);
				crossHorizontal.position.y = 0.45;
				
				kingGroup.add(kingBase);
				kingGroup.add(crossVertical);
				kingGroup.add(crossHorizontal);
				
				// Add wireframe for better visibility
				try {
					let kingWireframe1, kingWireframe2, kingWireframe3;
					
					if (typeof THREE.EdgesGeometry === 'function') {
						// Use EdgesGeometry if available
						kingWireframe1 = new THREE.LineSegments(
							new THREE.EdgesGeometry(kingBase.geometry),
							new THREE.LineBasicMaterial({ color: 0x000000 })
						);
						kingWireframe2 = new THREE.LineSegments(
							new THREE.EdgesGeometry(crossVertical.geometry),
							new THREE.LineBasicMaterial({ color: 0x000000 })
						);
						kingWireframe3 = new THREE.LineSegments(
							new THREE.EdgesGeometry(crossHorizontal.geometry),
							new THREE.LineBasicMaterial({ color: 0x000000 })
						);
					} else {
						// Fallback to WireframeGeometry
						kingWireframe1 = new THREE.LineSegments(
							new THREE.WireframeGeometry(kingBase.geometry),
							new THREE.LineBasicMaterial({ color: 0x000000 })
						);
						kingWireframe2 = new THREE.LineSegments(
							new THREE.WireframeGeometry(crossVertical.geometry),
							new THREE.LineBasicMaterial({ color: 0x000000 })
						);
						kingWireframe3 = new THREE.LineSegments(
							new THREE.WireframeGeometry(crossHorizontal.geometry),
							new THREE.LineBasicMaterial({ color: 0x000000 })
						);
					}
					
					kingWireframe2.position.copy(crossVertical.position);
					kingWireframe3.position.copy(crossHorizontal.position);
					
					kingGroup.add(kingWireframe1);
					kingGroup.add(kingWireframe2);
					kingGroup.add(kingWireframe3);
				} catch (error) {
					console.warn('Could not create wireframe for king:', error);
					// Continue without wireframe
				}
				
				// Position the king
				kingGroup.position.set(x + 0.5, 0.4, z + 0.5);
				
				// Add to pieces group
				piecesGroup.add(kingGroup);
				return;
			default:
				// Default fallback geometry
				geometry = new THREE.SphereGeometry(0.3, 16, 16);
		}
		
	// Create the material
		const material = new THREE.MeshLambertMaterial({ color: color });
	
	// Create the mesh
		const piece = new THREE.Mesh(geometry, material);
	
	// Add wireframe for better visibility
	try {
		let wireframe;
		if (typeof THREE.EdgesGeometry === 'function') {
			// Use EdgesGeometry if available
			wireframe = new THREE.LineSegments(
				new THREE.EdgesGeometry(geometry),
				new THREE.LineBasicMaterial({ color: 0xffffff })
			);
		} else {
			// Fallback to WireframeGeometry which is more widely supported
			wireframe = new THREE.LineSegments(
				new THREE.WireframeGeometry(geometry),
				new THREE.LineBasicMaterial({ color: 0xffffff })
			);
		}
		piece.add(wireframe);
	} catch (error) {
		console.warn('Could not create wireframe for piece:', error);
		// Continue without wireframe
	}
	
	// Position the piece
	piece.position.set(x + 0.5, height/2, z + 0.5);
	
	// Add to the pieces group
	piecesGroup.add(piece);
	
	// Add label with piece type
	const label = createTextLabel(type, x + 0.5, height + 0.3, z + 0.5, 0xffffff);
	piecesGroup.add(label);
}

/**
 * Create a simple debug UI
 */
function createDebugUI() {
	// Create a debug panel
	const debugPanel = document.createElement('div');
	debugPanel.style.position = 'absolute';
	debugPanel.style.top = '10px';
	debugPanel.style.right = '10px';
	debugPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
	debugPanel.style.padding = '10px';
	debugPanel.style.borderRadius = '5px';
	debugPanel.style.zIndex = '1000';
	debugPanel.style.color = 'white';
	debugPanel.style.fontFamily = 'Arial, sans-serif';
	
	// Create title
	const title = document.createElement('h3');
	title.textContent = 'Debug Controls';
	title.style.margin = '0 0 10px 0';
	debugPanel.appendChild(title);
	
	// Create reset camera button
	const resetButton = document.createElement('button');
	resetButton.textContent = 'Reset Camera';
	resetButton.style.backgroundColor = '#2196F3';
	resetButton.style.color = 'white';
	resetButton.style.border = 'none';
	resetButton.style.padding = '8px 16px';
	resetButton.style.margin = '5px';
	resetButton.style.borderRadius = '4px';
	resetButton.style.cursor = 'pointer';
	resetButton.onclick = () => {
		if (window.resetCamera) {
			window.resetCamera();
			console.log('Camera reset to default position');
		}
	};
	debugPanel.appendChild(resetButton);
	
	// Create top view button
	const topButton = document.createElement('button');
	topButton.textContent = 'Top View';
	topButton.style.backgroundColor = '#2196F3';
	topButton.style.color = 'white';
	topButton.style.border = 'none';
	topButton.style.padding = '8px 16px';
	topButton.style.margin = '5px';
	topButton.style.borderRadius = '4px';
	topButton.style.cursor = 'pointer';
	topButton.onclick = () => {
		if (window.topView) {
			window.topView();
			console.log('Camera set to top view');
		}
	};
	debugPanel.appendChild(topButton);
	
	// Create side view button
	const sideButton = document.createElement('button');
	sideButton.textContent = 'Side View';
	sideButton.style.backgroundColor = '#2196F3';
	sideButton.style.color = 'white';
	sideButton.style.border = 'none';
	sideButton.style.padding = '8px 16px';
	sideButton.style.margin = '5px';
	sideButton.style.borderRadius = '4px';
	sideButton.style.cursor = 'pointer';
	sideButton.onclick = () => {
		if (window.sideView) {
			window.sideView();
			console.log('Camera set to side view');
		}
	};
	debugPanel.appendChild(sideButton);
	
	// Add home zone view button
	const homeButton = document.createElement('button');
	homeButton.textContent = 'View Home Zone';
	homeButton.style.backgroundColor = '#FFA500';
	homeButton.style.color = 'white';
	homeButton.style.border = 'none';
	homeButton.style.padding = '8px 16px';
	homeButton.style.margin = '5px';
	homeButton.style.borderRadius = '4px';
	homeButton.style.cursor = 'pointer';
	homeButton.onclick = () => {
		// Focus on home zone (coordinates 12, 0, 15)
		if (window.camera) {
			window.camera.position.set(12, 10, 20);
			window.camera.lookAt(12, 0, 15);
			console.log('Camera focused on home zone');
		}
	};
	debugPanel.appendChild(homeButton);
	
	// Create camera info element
	const cameraInfo = document.createElement('div');
	cameraInfo.id = 'camera-info';
	cameraInfo.style.marginTop = '10px';
	debugPanel.appendChild(cameraInfo);
	
	// Update camera info periodically
	setInterval(() => {
		if (window.camera) {
			const pos = window.camera.position;
			cameraInfo.textContent = `Camera: x=${pos.x.toFixed(1)}, y=${pos.y.toFixed(1)}, z=${pos.z.toFixed(1)}`;
		}
	}, 500);
	
	// Add the debug panel to the container
	if (container) {
		container.appendChild(debugPanel);
	}
}

/**
 * Get the scene object
 * @returns {THREE.Scene} The scene object
 */
export function getScene() {
	if (!scene) {
		console.warn('Scene not initialized yet');
		return null;
	}
	return scene;
}

/**
 * Get the camera object
 * @returns {THREE.Camera} The camera object
 */
export function getCamera() {
	if (!camera) {
		console.warn('Camera not initialized yet');
		return null;
	}
	return camera;
}

/**
 * Get the renderer object
 * @returns {THREE.WebGLRenderer} The renderer object
 */
export function getRenderer() {
	if (!renderer) {
		console.warn('Renderer not initialized yet');
		return null;
	}
	return renderer;
}

/**
 * Create a placeholder texture with text
 * @param {string} name - The name to display on the texture
 * @param {number} width - The width of the texture
 * @param {number} height - The height of the texture
 * @param {string} color - The background color
 * @returns {THREE.Texture} The created texture
 */
function createPlaceholderTexture(name, width = 512, height = 512, color = '#444444') {
	// Use the imported function from browser-texture-generator.js
	return createTexture(name, width, height, color);
}