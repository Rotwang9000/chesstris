/**
 * Renderer Core Module
 * Contains core rendering functions and scene setup
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Constants } from '../../config/constants.js';
import { createTexture } from '../../utils/browser-texture-generator.js';

// Shared variables
let container;
let scene;
let camera;
let renderer;
let controls;
let materials = {};
let isInitialized = false;
let animationFrameId;

/**
 * Initialize the core renderer
 * @param {HTMLElement} containerElement - The container element
 * @param {Object} options - Renderer options
 * @returns {boolean} Whether initialization was successful
 */
export function init(containerElement, options = {}) {
	try {
		// Store references
		container = containerElement;
		
		// Set default options
		const defaultOptions = {
			debug: false,
			enableSkybox: true,
			enableClouds: true,
			enableEffects: true,
			enableRussianTheme: true,
			cellSize: Constants.CELL_SIZE || 1,
			boardSize: Constants.BOARD_SIZE || 8
		};
		
		// Merge options
		let mergedOptions = { ...defaultOptions, ...options };
		
		// Initialize scene
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x87CEEB); // Sky blue
		
		// Initialize camera
		const aspect = container.clientWidth / container.clientHeight;
		camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
		camera.position.set(10, 10, 10);
		camera.lookAt(0, 0, 0);
		
		// Initialize renderer
		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(container.clientWidth, container.clientHeight);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		
		// Add renderer to container
		container.appendChild(renderer.domElement);
		
		// Initialize controls
		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.screenSpacePanning = false;
		controls.minDistance = 5;
		controls.maxDistance = 50;
		controls.maxPolarAngle = Math.PI / 2;
		
		// Set up lights
		setupLights(scene, mergedOptions);
		
		// Load textures
		materials = loadTextures(mergedOptions);
		
		// No ground plane for infinite sky theme
		// Instead, set a gradient sky background
		scene.background = new THREE.Color(0x87CEEB); // Sky blue
		
		// Add coordinate axes only in debug mode
		if (mergedOptions.debug) {
			createCoordinateAxes();
		}
		
		// Add test cells only in debug mode
		if (mergedOptions.debug) {
			createTestCells();
		}
		
		// Set up window resize handler
		window.addEventListener('resize', onWindowResize);
		
		// Start animation loop
		animate(0);
		
		// Set initialized flag
		isInitialized = true;
		
		console.log('Core renderer initialized successfully');
		return true;
	} catch (error) {
		console.error('Error initializing core renderer:', error);
		return false;
	}
}

/**
 * Animation loop
 * @param {number} time - Current time
 */
function animate(time) {
	try {
		// Request next frame
		animationFrameId = requestAnimationFrame(animate);
		
		// Update controls
		if (controls) {
			controls.update();
		}
		
		// Render scene
		if (renderer && scene && camera) {
			renderer.render(scene, camera);
		}
	} catch (error) {
		console.error('Error in animation loop:', error);
	}
}

/**
 * Creates a ground plane for orientation
 */
function createGroundPlane() {
	try {
		const planeGeometry = new THREE.PlaneGeometry(100, 100);
		const planeMaterial = new THREE.MeshStandardMaterial({
			color: 0x999999,
			side: THREE.DoubleSide,
			transparent: true,
			opacity: 0.5
		});
		
		const plane = new THREE.Mesh(planeGeometry, planeMaterial);
		plane.rotation.x = Math.PI / 2;
		plane.position.y = -10;
		plane.receiveShadow = true;
		
		return plane;
	} catch (error) {
		console.error('Error creating ground plane:', error);
		return null;
	}
}

/**
 * Creates coordinate axes for debugging
 */
function createCoordinateAxes() {
	try {
		const axesHelper = new THREE.AxesHelper(5);
		scene.add(axesHelper);
		
		// Add text labels for axes
		createTextLabel('X', 5.5, 0, 0, 0xFF0000);
		createTextLabel('Y', 0, 5.5, 0, 0x00FF00);
		createTextLabel('Z', 0, 0, 5.5, 0x0000FF);
	} catch (error) {
		console.error('Error creating coordinate axes:', error);
	}
}

/**
 * Creates a text label
 * @param {string} text - Text to display
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} z - Z position
 * @param {number} color - Text color
 */
function createTextLabel(text, x, y, z, color = 0xFFFFFF) {
	try {
		const canvas = document.createElement('canvas');
		const context = canvas.getContext('2d');
		canvas.width = 128;
		canvas.height = 128;
		
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, canvas.width, canvas.height);
		
		context.font = 'Bold 80px Arial';
		context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.fillText(text, canvas.width / 2, canvas.height / 2);
		
		const texture = new THREE.CanvasTexture(canvas);
		const material = new THREE.SpriteMaterial({ map: texture });
		const sprite = new THREE.Sprite(material);
		
		sprite.position.set(x, y, z);
		sprite.scale.set(1, 1, 1);
		
		scene.add(sprite);
	} catch (error) {
		console.error('Error creating text label:', error);
	}
}

/**
 * Sets up lights for the scene
 * @param {THREE.Scene} scene - The scene to add lights to
 * @param {Object} options - Light options
 */
function setupLights(scene, options = {}) {
	try {
		// Ambient light
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
		scene.add(ambientLight);
		
		// Directional light (sun)
		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
		directionalLight.position.set(10, 20, 10);
		directionalLight.castShadow = true;
		
		// Configure shadow properties
		directionalLight.shadow.mapSize.width = 2048;
		directionalLight.shadow.mapSize.height = 2048;
		directionalLight.shadow.camera.near = 0.5;
		directionalLight.shadow.camera.far = 50;
		directionalLight.shadow.camera.left = -20;
		directionalLight.shadow.camera.right = 20;
		directionalLight.shadow.camera.top = 20;
		directionalLight.shadow.camera.bottom = -20;
		
		scene.add(directionalLight);
		
		// Add a helper for the directional light if in debug mode
		if (options.debug) {
			const helper = new THREE.DirectionalLightHelper(directionalLight, 5);
			scene.add(helper);
			
			const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
			scene.add(shadowHelper);
		}
		
		console.log('Lights set up successfully');
	} catch (error) {
		console.error('Error setting up lights:', error);
	}
}

/**
 * Loads textures for the scene
 * @param {Object} options - Texture options
 * @returns {Object} Loaded materials
 */
function loadTextures(options = {}) {
	try {
		const texturePaths = {
			board: './img/textures/board.png',
			cell: './img/textures/cell.png',
			homeZone: './img/textures/home_zone.png'
		};
		
		console.log('Using texture paths:', texturePaths);
		
		const materials = {};
		const textureLoader = new THREE.TextureLoader();
		
		const loadTextureWithFallback = (textureKey, fallbackColor) => {
			console.log('Loading texture:', texturePaths[textureKey]);
			
			return new Promise((resolve) => {
				textureLoader.load(
					texturePaths[textureKey],
					(texture) => {
						// Texture loaded successfully
						texture.wrapS = THREE.RepeatWrapping;
						texture.wrapT = THREE.RepeatWrapping;
						texture.repeat.set(1, 1);
						
						const material = new THREE.MeshStandardMaterial({
							map: texture,
							roughness: 0.7,
							metalness: 0.2
						});
						
						materials[textureKey] = material;
						console.log('Successfully loaded texture:', texturePaths[textureKey]);
						resolve();
					},
					undefined,
					(error) => {
						// Error loading texture, use fallback
						console.warn('Error loading texture:', texturePaths[textureKey], error);
						
						// Create a fallback material with the specified color
						materials[textureKey] = new THREE.MeshStandardMaterial({
							color: fallbackColor,
							roughness: 0.7,
							metalness: 0.2
						});
						
						resolve();
					}
				);
			});
		};
		
		// Load all textures
		Promise.all([
			loadTextureWithFallback('board', 0x8B4513),
			loadTextureWithFallback('cell', 0x4FC3F7),
			loadTextureWithFallback('homeZone', 0xFFD54F)
		]).then(() => {
			console.log('All textures loaded');
		});
		
		return materials;
	} catch (error) {
		console.error('Error loading textures:', error);
		return {};
	}
}

/**
 * Handles window resize
 */
function onWindowResize() {
	try {
		if (!container || !camera || !renderer) return;
		
		// Update camera aspect ratio
		camera.aspect = container.clientWidth / container.clientHeight;
		camera.updateProjectionMatrix();
		
		// Update renderer size
		renderer.setSize(container.clientWidth, container.clientHeight);
	} catch (error) {
		console.error('Error handling window resize:', error);
	}
}

/**
 * Initialize the game world
 * @param {string} playerId - Player ID
 */
export function initializeGameWorld(playerId) {
	try {
		// Implementation will be added later
	} catch (error) {
		console.error('Error initializing game world:', error);
	}
}

/**
 * Clean up resources
 */
export function cleanup() {
	try {
		// Stop animation loop
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		
		// Remove event listeners
		window.removeEventListener('resize', onWindowResize);
		
		// Dispose of resources
		if (scene) {
			scene.traverse((object) => {
				if (object.geometry) {
					object.geometry.dispose();
				}
				
				if (object.material) {
					if (Array.isArray(object.material)) {
						object.material.forEach((material) => {
							if (material.map) material.map.dispose();
							material.dispose();
						});
					} else {
						if (object.material.map) object.material.map.dispose();
						object.material.dispose();
					}
				}
			});
		}
		
		// Clear references
		scene = null;
		camera = null;
		
		if (renderer) {
			renderer.dispose();
			renderer.domElement.remove();
			renderer = null;
		}
		
		if (controls) {
			controls.dispose();
			controls = null;
		}
		
		// Clear container
		if (container) {
			container.innerHTML = '';
		}
		
		// Reset initialization flag
		isInitialized = false;
		
		console.log('Core renderer cleaned up');
	} catch (error) {
		console.error('Error cleaning up core renderer:', error);
	}
}

/**
 * Creates test cells for debugging
 */
function createTestCells() {
	// Implementation will be added if needed
}

/**
 * Creates a debug UI
 */
function createDebugUI() {
	// Implementation will be added if needed
}

/**
 * Get the scene
 * @returns {THREE.Scene} The scene
 */
export function getScene() {
	return scene;
}

/**
 * Get the camera
 * @returns {THREE.Camera} The camera
 */
export function getCamera() {
	return camera;
}

/**
 * Get the renderer
 * @returns {THREE.WebGLRenderer} The renderer
 */
export function getRenderer() {
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