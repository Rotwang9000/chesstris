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
let isInitialized = false;

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
		
		console.log('Initializing renderer...');
		container = containerElement;
		
		// Create scene
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x121212);
		
		// Make scene globally available for debugging
		window.scene = scene;
		
		// Create camera
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
		
		// Create renderer
		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(container.clientWidth, container.clientHeight);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		container.appendChild(renderer.domElement);
		
		// Add orbit controls
		controls = new THREE.OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		
		// Add camera control shortcuts
		window.resetCamera = () => {
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
		
		// Share groups with other modules
		window.boardGroup = boardGroup;
		window.piecesGroup = piecesGroup;
		window.tetrominoGroup = tetrominoGroup;
		window.ghostGroup = ghostGroup;
		window.uiGroup = uiGroup;
		window.decorationsGroup = decorationsGroup;
		
		// Add lights
		setupLights(scene, options);
		
		// Create a ground plane for orientation
		createGroundPlane();
		
		// Create coordinate axes
		createCoordinateAxes();
		
		// Create test board cells for DEBUG
		createTestCells();
		
		// Add fog if not in test mode with reduced density
		scene.fog = new FogExp2(0x111133, options.useTestMode ? 0.0005 : 0.002);
		
		// Add skybox and clouds if not in test mode
		if (!options.useTestMode && typeof createSkybox === 'function') {
			try {
				const skybox = createSkybox();
				if (skybox) {
					scene.add(skybox);
					console.log('Skybox added to scene');
				}
				
				if (typeof addClouds === 'function') {
					addClouds(scene);
					console.log('Clouds added to scene');
				}
			} catch (e) {
				console.warn('Failed to create skybox or clouds:', e);
			}
		}
		
		// Load textures
		if (options.textureLoader) {
			window.TEXTURE_LOADER = options.textureLoader;
		}
		loadTextures(options);
		
		// Handle window resize
		window.addEventListener('resize', onWindowResize);
		
		// Add debug UI
		createDebugUI();
		
		// Animation loop
		function animate(time) {
			requestAnimationFrame(animate);
			
			// Calculate delta time for animations
			const delta = (time - lastTime) / 1000;
			lastTime = time;
			
			// Update controls
			controls.update();
			
			// Update animations
			if (typeof animatePotionsAndParticles === 'function') {
				try {
					animatePotionsAndParticles(delta);
				} catch (e) {
					// Ignore animation errors
				}
			}
			
			// Update player labels
			if (typeof updatePlayerLabels === 'function') {
				try {
					updatePlayerLabels(camera);
				} catch (e) {
					// Ignore label update errors
				}
			}
			
			// Render scene
			renderer.render(scene, camera);
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
	// Create brighter ambient light for better overall visibility
	const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
	scene.add(ambientLight);
	
	// Create main directional light (sun)
	const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
	directionalLight.position.set(50, 100, 50);
	directionalLight.castShadow = true;
	
	// Configure shadow properties for better quality
	directionalLight.shadow.mapSize.width = 2048;
	directionalLight.shadow.mapSize.height = 2048;
	directionalLight.shadow.camera.near = 0.5;
	directionalLight.shadow.camera.far = 500;
	directionalLight.shadow.camera.left = -100;
	directionalLight.shadow.camera.right = 100;
	directionalLight.shadow.camera.top = 100;
	directionalLight.shadow.camera.bottom = -100;
	
	scene.add(directionalLight);
	
	// Add a spotlight to highlight the board center
	const spotlight = new THREE.SpotLight(0xffffff, 1.0);
	spotlight.position.set(12, 30, 12);
	spotlight.angle = Math.PI / 4;
	spotlight.penumbra = 0.1;
	spotlight.decay = 1;
	spotlight.distance = 100;
	spotlight.castShadow = true;
	spotlight.shadow.mapSize.width = 1024;
	spotlight.shadow.mapSize.height = 1024;
	spotlight.target.position.set(12, 0, 12); // Target the board center
	scene.add(spotlight);
	scene.add(spotlight.target);
	
	// Add point light for local illumination
	const pointLight = new THREE.PointLight(0xffffcc, 1.0, 50);
	pointLight.position.set(12, 10, 12);
	pointLight.castShadow = true;
	scene.add(pointLight);
	
	console.log('Lights added to scene');
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
	// Import board module functions if available
	const createCell = window.boardModule && window.boardModule.createCell;
	const createChessPiece = window.piecesModule && window.piecesModule.createChessPiece;
	
	// If we can't access these functions, create our own simple versions
	if (!createCell || !createChessPiece) {
		console.warn('Board or pieces module not available, creating simple test cells');
		
		// Create simple test cells in a checkerboard pattern
		for (let z = 5; z < 15; z++) {
			for (let x = 5; x < 15; x++) {
				if ((x + z) % 2 === 0) {
					// Create a simple cell
					const cellGeometry = new THREE.BoxGeometry(1, 0.2, 1);
					const cellMaterial = new THREE.MeshBasicMaterial({
						color: (z >= 12) ? 0xFFA500 : 0x42A5F5, // Orange for home zones, blue for regular
						wireframe: false
					});
					const cell = new THREE.Mesh(cellGeometry, cellMaterial);
					cell.position.set(x, 0, z);
					
					// Add a wireframe outline
					const wireGeometry = new THREE.BoxGeometry(1.02, 0.22, 1.02);
					const wireMaterial = new THREE.MeshBasicMaterial({
						color: 0xFFFFFF,
						wireframe: true
					});
					const wireframe = new THREE.Mesh(wireGeometry, wireMaterial);
					cell.add(wireframe);
					
					boardGroup.add(cell);
				}
			}
		}
		
		// Create some test chess pieces
		const piecePositions = [
			{ x: 7, z: 10, type: 'pawn' },
			{ x: 8, z: 10, type: 'rook' },
			{ x: 9, z: 10, type: 'knight' }
		];
		
		piecePositions.forEach(pos => {
			const pieceGeometry = new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8);
			const pieceMaterial = new THREE.MeshBasicMaterial({
				color: 0xFF00FF,
				wireframe: false
			});
			const piece = new THREE.Mesh(pieceGeometry, pieceMaterial);
			piece.position.set(pos.x, 0.6, pos.z); // Position at the center of the cell, slightly elevated
			
			// Add wireframe outline
			const wireGeometry = new THREE.CylinderGeometry(0.31, 0.41, 1.21, 8);
			const wireMaterial = new THREE.MeshBasicMaterial({
				color: 0xFFFFFF,
				wireframe: true
			});
			const wireframe = new THREE.Mesh(wireGeometry, wireMaterial);
			piece.add(wireframe);
			
			// Add label
			const canvas = document.createElement('canvas');
			canvas.width = 128;
			canvas.height = 64;
			const ctx = canvas.getContext('2d');
			
			ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			
			ctx.fillStyle = 'white';
			ctx.font = 'bold 20px Arial';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(pos.type.toUpperCase(), canvas.width/2, canvas.height/2);
			
			const texture = new THREE.CanvasTexture(canvas);
			const labelMaterial = new THREE.SpriteMaterial({ map: texture });
			const label = new THREE.Sprite(labelMaterial);
			label.position.set(0, 1.0, 0);
			label.scale.set(1, 0.5, 1);
			piece.add(label);
			
			piecesGroup.add(piece);
		});
	} else {
		console.log('Using board and pieces modules to create test cells');
		
		// Create test cells using the imported functions
		for (let z = 5; z < 15; z++) {
			for (let x = 5; x < 15; x++) {
				if ((x + z) % 2 === 0) {
					const cellOptions = {
						color: (z >= 12) ? 0xFFA500 : 0x42A5F5,
						isHomeZone: z >= 12
					};
					createCell(x, z, cellOptions);
				}
			}
		}
		
		// Create test chess pieces
		const piecePositions = [
			{ x: 7, z: 10, type: 'pawn' },
			{ x: 8, z: 10, type: 'rook' },
			{ x: 9, z: 10, type: 'knight' }
		];
		
		piecePositions.forEach(pos => {
			createChessPiece(pos.type, {
				position: { x: pos.x, y: 0, z: pos.z },
				color: 0xFF00FF,
				showLabel: true
			});
		});
	}
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
		if (window.camera) {
			window.camera.position.set(12, 15, 12);
			window.camera.lookAt(12, 0, 12);
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
		if (window.camera) {
			window.camera.position.set(12, 30, 12);
			window.camera.lookAt(12, 0, 12);
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
		if (window.camera) {
			window.camera.position.set(30, 5, 12);
			window.camera.lookAt(12, 0, 12);
		}
	};
	debugPanel.appendChild(sideButton);
	
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