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
import * as EffectsModule from './effects.js';
import { updatePlayerLabels } from './pieces.js';

// Create shorter aliases for frequently used functions
const { createSkybox, addClouds, animatePotionsAndParticles } = EffectsModule;

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

/**
 * Initialize the renderer
 * @param {HTMLElement} containerElement - DOM container to render into
 * @param {Object} options - Initialization options
 * @returns {Object|false} - Initialization result object or false if failed
 */
export function init(containerElement, options = {}) {
	try {
		// Prevent multiple initializations
		if (isInitialized) {
			console.warn('Renderer already initialized, skipping');
			return {
				scene, camera, renderer, controls,
				boardGroup, piecesGroup, tetrominoGroup, ghostGroup, decorationsGroup,
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
			scene.background = new THREE.Color(0x121212);
			
			// Make scene globally available for debugging
			window.scene = scene;
			
			console.log('Scene created successfully');
		} catch (sceneError) {
			console.error('Error creating scene:', sceneError);
			return false;
		}
		
		// Add skybox if enabled
		if (options.enableSkybox) {
			try {
				const skybox = EffectsModule.createSkybox();
				if (skybox) {
					scene.add(skybox);
					console.log('Skybox added to scene');
				}
			} catch (error) {
				console.warn('Failed to create skybox:', error);
			}
		}
		
		// Add clouds if enabled
		if (options.enableClouds) {
			try {
				EffectsModule.addClouds(scene);
				console.log('Clouds added to scene');
			} catch (error) {
				console.warn('Failed to add clouds:', error);
			}
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
			uiGroup = new THREE.Group();
			decorationsGroup = new THREE.Group();
			ghostGroup = new THREE.Group();
			
			scene.add(boardGroup);
			scene.add(piecesGroup);
			scene.add(tetrominoGroup);
			scene.add(ghostGroup);
			scene.add(uiGroup);
			scene.add(decorationsGroup);
			
			console.log('Scene groups created and added successfully');
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
			
			if (controls) {
				controls.enableDamping = true;
				controls.dampingFactor = 0.05;
			}
		} catch (error) {
			console.warn('Error initializing camera controls:', error);
			// Create a basic placeholder for controls to avoid null errors
			controls = {
				update: () => {},
				target: new THREE.Vector3(12, 0, 12),
				enabled: false
			};
		}
		
		// Add camera control shortcuts
		window.resetCamera = () => {
			const cameraOptions = options.cameraOptions || {};
			const cameraPosition = cameraOptions.position || { x: 12, y: 15, z: 20 };
			const cameraLookAt = cameraOptions.lookAt || { x: 12, y: 0, z: 12 };
			camera.position.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
			camera.lookAt(cameraLookAt.x, cameraLookAt.y, cameraLookAt.z);
		};
		
		window.topView = () => {
			camera.position.set(12, 30, 12);
			camera.lookAt(12, 0, 12);
		};
		
		window.sideView = () => {
			camera.position.set(30, 5, 12);
			camera.lookAt(12, 0, 12);
		};
		
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
		
		// Grid helper with try/catch
		try {
			const gridHelper = new THREE.GridHelper(30, 30, 0x444444, 0x222222);
			scene.add(gridHelper);
			console.log('Grid helper added to scene');
		} catch (gridError) {
			console.error('Error creating grid helper:', gridError);
			// Continue anyway - non-critical
		}
		
		// Create coordinate axes with try/catch
		try {
			createCoordinateAxes();
		} catch (axesError) {
			console.error('Error creating coordinate axes:', axesError);
			// Continue anyway - non-critical
		}
		
		// Create test cells with try/catch
		try {
			createTestCells();
		} catch (cellsError) {
			console.error('Error creating test cells:', cellsError);
			// Continue anyway - non-critical
		}
		
		// Add fog if not in test mode with reduced density
		scene.fog = new FogExp2(0x111133, options.useTestMode ? 0.0005 : 0.002);
		
		// Load textures
		if (options.textureLoader) {
			window.TEXTURE_LOADER = options.textureLoader;
		}
		loadTextures(options);
		
		// Handle window resize
		window.addEventListener('resize', onWindowResize);
		
		// Add debug UI
		createDebugUI();
		
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
		
		createMovingTetromino();
		
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
				
				// Animate the moving tetromino
				if (movingTetromino) {
					// Rotate the tetromino
					movingTetromino.rotation.y += delta * 0.5;
					movingTetromino.rotation.x += delta * 0.3;
					
					// Make the tetromino bob up and down
					const hoverHeight = Math.sin(time * 0.001) * 2;
					movingTetromino.position.y = 15 + hoverHeight;
				}
				
				// Update animations
				if (typeof animatePotionsAndParticles === 'function') {
					try {
						animatePotionsAndParticles(delta);
					} catch (e) {
						console.warn('Animation error in potions/particles:', e);
					}
				}
				
				// Update player labels
				if (typeof updatePlayerLabels === 'function') {
					try {
						updatePlayerLabels(camera);
					} catch (e) {
						console.warn('Error updating player labels:', e);
					}
				}
				
				// Render scene
				if (scene && camera && renderer) {
					renderer.render(scene, camera);
				} else {
					console.warn('Cannot render: missing scene, camera, or renderer');
					cancelAnimationFrame(animationId);
				}
			} catch (error) {
				console.error('Animation loop error:', error);
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
		
		return {
			scene, camera, renderer, controls,
			boardGroup, piecesGroup, tetrominoGroup, ghostGroup, decorationsGroup,
			materials
		};
	} catch (error) {
		console.error('Renderer initialization error:', error);
		return false;
	}
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
 * Set up lights for the scene
 * @param {THREE.Scene} scene - The scene to add lights to
 * @param {Object} options - Options for lighting
 */
function setupLights(scene, options = {}) {
	// Clean up old lights
	scene.traverse(object => {
		if (object.isLight) {
			scene.remove(object);
		}
	});
	
	// Create ambient light
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
	scene.add(ambientLight);
	
	// Create directional light (sun)
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
	directionalLight.position.set(50, 200, 100);
	directionalLight.castShadow = true;
	
	// Improve shadow quality
	directionalLight.shadow.mapSize.width = 1024;
	directionalLight.shadow.mapSize.height = 1024;
	directionalLight.shadow.camera.near = 10;
	directionalLight.shadow.camera.far = 500;
	directionalLight.shadow.camera.left = -50;
	directionalLight.shadow.camera.right = 50;
	directionalLight.shadow.camera.top = 50;
	directionalLight.shadow.camera.bottom = -50;
	scene.add(directionalLight);
	
	// Add a point light over the board
	const pointLight = new THREE.PointLight(0xffffcc, 1, 50);
	pointLight.position.set(10, 15, 10);
	pointLight.castShadow = true;
	scene.add(pointLight);
	
	// Add two colored rim lights for dramatic effect
	const blueLight = new THREE.PointLight(0x0066ff, 0.7, 40);
	blueLight.position.set(-20, 10, 20);
	scene.add(blueLight);
	
	const purpleLight = new THREE.PointLight(0xff00ff, 0.5, 40);
	purpleLight.position.set(20, 5, -10);
	scene.add(purpleLight);
	
	// Helper for debug mode
	if (options.debug) {
		const directionalLightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
		scene.add(directionalLightHelper);
		
		const pointLightHelper = new THREE.PointLightHelper(pointLight, 1);
		scene.add(pointLightHelper);
		
		console.log('Light helpers added for debugging');
	}
	
	console.log('Scene lighting setup complete with enhanced lights');
}

/**
 * Create a placeholder texture
 */
function createPlaceholderTexture(name, width = 128, height = 128, color = '#444444') {
	// Create canvas
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	
	// Background
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, width, height);
	
	// Grid
	ctx.strokeStyle = '#FFFFFF';
	ctx.lineWidth = 2;
	
	// Create a grid pattern
	const gridSize = 16;
	for (let x = 0; x < width; x += gridSize) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();
	}
	
	for (let y = 0; y < height; y += gridSize) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
	
	// Add label
	ctx.fillStyle = '#FFFFFF';
	ctx.font = 'bold 20px Arial';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(name, width / 2, height / 2);
	
	// Create texture
	const texture = new THREE.CanvasTexture(canvas);
	return texture;
}

/**
 * Load textures needed for the renderer
 */
function loadTextures(options = {}) {
	try {
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
						128, 
						128, 
						fallbackColor || '#444444'
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
					undefined, // Progress callback
					(error) => {
						console.warn(`Error loading texture ${path}:`, error);
						const placeholderTexture = createPlaceholderTexture(
							textureKey, 
							128, 
							128, 
							fallbackColor || '#444444'
						);
						materials[textureKey] = placeholderTexture;
						resolve(placeholderTexture);
					}
				);
				
				return texture;
			});
		};
		
		// Load all textures in parallel with different fallback colors
		Promise.all([
			loadTextureWithFallback('board', '#5d4037'), // Brown for board
			loadTextureWithFallback('cell', '#42a5f5'), // Blue for cells
			loadTextureWithFallback('homeZone', '#7986cb') // Indigo for home zone
		]).then(() => {
			console.log('All textures loaded');
		});
		
	} catch (error) {
		console.error('Error loading textures:', error);
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
		console.log('Initialized game world with player:', playerId);
	} catch (error) {
		console.error('Error initializing game world:', error);
	}
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
	const cellSize = 2.5;
	const boardSize = 8;
	
	// Create checkerboard pattern
	for (let x = 0; x < boardSize; x++) {
		for (let z = 0; z < boardSize; z++) {
			const isEven = (x + z) % 2 === 0;
			const material = new THREE.MeshLambertMaterial({
				color: isEven ? 0x888888 : 0x444444,
				transparent: true,
				opacity: 0.9
			});
			const geometry = new THREE.BoxGeometry(cellSize, 0.5, cellSize);
			const cell = new THREE.Mesh(geometry, material);
			
			// Position cells to form a grid
			cell.position.x = x * cellSize;
			cell.position.y = 0;
			cell.position.z = z * cellSize;
			
			// Add to board group
			boardGroup.add(cell);
			console.log(`Created test cell at x:${x}, z:${z}`);
		}
	}
	
	// Create larger, more visible test objects
	// A red tetromino-like shape in the center
	const createTetromino = () => {
		const tetrominoGroup = new THREE.Group();
		const blockGeometry = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
		const blockMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
		
		// T-shaped tetromino
		const positions = [
			{ x: 0, y: 0, z: 0 },  // center
			{ x: -1, y: 0, z: 0 }, // left
			{ x: 1, y: 0, z: 0 },  // right
			{ x: 0, y: 0, z: 1 }   // bottom
		];
		
		positions.forEach(pos => {
			const block = new THREE.Mesh(blockGeometry, blockMaterial);
			block.position.set(
				pos.x * cellSize + boardSize * cellSize / 2, 
				cellSize/2 + 1,  // Slightly above the board
				pos.z * cellSize + boardSize * cellSize / 2
			);
			block.castShadow = true;
			tetrominoGroup.add(block);
		});
		
		return tetrominoGroup;
	};
	
	// Create some chess pieces as well
	const createChessPiece = (type, color, x, z) => {
		// Simplified geometry for chess pieces
		let geometry;
		
		switch(type) {
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
				
				knightGroup.position.set(x * cellSize, 0.6 * cellSize, z * cellSize);
				knightGroup.castShadow = true;
				boardGroup.add(knightGroup);
				return;
			default:
				geometry = new THREE.SphereGeometry(0.6 * cellSize, 8, 8);
		}
		
		const material = new THREE.MeshLambertMaterial({ color: color });
		const piece = new THREE.Mesh(geometry, material);
		piece.position.set(x * cellSize, 0.6 * cellSize, z * cellSize);
		piece.castShadow = true;
		boardGroup.add(piece);
	};
	
	// Add the tetromino
	boardGroup.add(createTetromino());
	
	// Add some chess pieces on the board edges
	createChessPiece('rook', 0xffffff, 0, 0);
	createChessPiece('knight', 0xffffff, 1, 0);
	createChessPiece('pawn', 0xffffff, 0, 1);
	createChessPiece('pawn', 0xffffff, 1, 1);
	
	createChessPiece('rook', 0x222222, 7, 7);
	createChessPiece('knight', 0x222222, 6, 7);
	createChessPiece('pawn', 0x222222, 7, 6);
	createChessPiece('pawn', 0x222222, 6, 6);
	
	console.log('Test cells created successfully');
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