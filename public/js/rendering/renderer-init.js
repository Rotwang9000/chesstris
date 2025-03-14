/**
 * Renderer Initialization
 * Handles proper initialization of all renderer modules in the correct order
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Constants } from '../config/constants.js';
import * as CoreRenderer from './modules/core.js';
import * as BoardRenderer from './modules/board.js';
import * as PiecesRenderer from './modules/pieces.js';
import * as TetrominoRenderer from './modules/tetromino.js';
import * as EffectsRenderer from './modules/effects.js';

// Shared state
let isInitialized = false;
let container = null;
let scene = null;
let camera = null;
let renderer = null;
let controls = null;

// Groups
let boardGroup = null;
let piecesGroup = null;
let tetrominoGroup = null;
let ghostGroup = null;
let decorationsGroup = null;
let uiGroup = null;

// Materials
let materials = {};

/**
 * Initialize the renderer and all its modules
 * @param {HTMLElement} containerElement - The container to render into
 * @param {Object} options - Renderer options
 * @returns {boolean} - Whether initialization was successful
 */
export async function init(containerElement, options = {}) {
	try {
		if (isInitialized) {
			console.warn('Renderer already initialized');
			return true;
		}

		// Validate container
		if (!containerElement || !(containerElement instanceof HTMLElement)) {
			console.error('Invalid container element provided');
			return false;
		}

		container = containerElement;

		// Set default options
		const defaultOptions = {
			enableSkybox: true,
			enableClouds: true,
			enableEffects: true,
			enableRussianTheme: true,
			debug: false,
			cellSize: Constants.CELL_SIZE || 1,
			boardSize: Constants.BOARD_SIZE || 8 // Use the board size from Constants or default to 8
		};

		const mergedOptions = { ...defaultOptions, ...options };

		// Initialize scene
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x87CEEB); // Sky blue background

		// Initialize camera
		const aspect = container.clientWidth / container.clientHeight;
		camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
		camera.position.set(12, 15, 20);
		camera.lookAt(12, 0, 12);

		// Initialize renderer
		renderer = new THREE.WebGLRenderer({ 
			antialias: true,
			alpha: true
		});
		renderer.setSize(container.clientWidth, container.clientHeight);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		container.appendChild(renderer.domElement);

		// Initialize controls
		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.screenSpacePanning = false;
		controls.minDistance = 5;
		controls.maxDistance = 50;
		controls.maxPolarAngle = Math.PI / 2;

		// Initialize groups
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

		// Make groups available to modules but not globally
		window.boardGroup = boardGroup;
		window.piecesGroup = piecesGroup;
		window.tetrominoGroup = tetrominoGroup;
		window.ghostGroup = ghostGroup;
		window.decorationsGroup = decorationsGroup;
		window.uiGroup = uiGroup;

		// Add lights
		addLights();

		// Initialize core renderer
		await CoreRenderer.init(container, {
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
			materials,
			...mergedOptions
		});

		// Initialize other modules
		BoardRenderer.init(boardGroup, materials);
		PiecesRenderer.init(piecesGroup);
		TetrominoRenderer.init(tetrominoGroup, ghostGroup);
		EffectsRenderer.init(decorationsGroup);

		// Add skybox and clouds if enabled
		if (mergedOptions.enableSkybox) {
			const skybox = EffectsRenderer.createSkybox();
			if (skybox) {
				scene.add(skybox);
			}
		}

		if (mergedOptions.enableClouds) {
			EffectsRenderer.addClouds(scene);
		}

		// Add Russian theme elements if enabled
		if (mergedOptions.enableRussianTheme) {
			console.log('Adding Russian theme elements');
			EffectsRenderer.addRussianThemeElements(scene);
		}

		// Start animation loop
		function animate() {
			requestAnimationFrame(animate);

			// Update controls
			controls.update();

			// Render scene
			renderer.render(scene, camera);
		}
		animate();

		// Handle window resizing
		window.addEventListener('resize', () => {
			camera.aspect = container.clientWidth / container.clientHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(container.clientWidth, container.clientHeight);
		});

		isInitialized = true;
		console.log('Renderer initialized successfully');
		return true;
	} catch (error) {
		console.error('Error initializing renderer:', error);
		return false;
	}
}

/**
 * Add lights to the scene
 */
function addLights() {
	// Ambient light for overall illumination
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
	scene.add(ambientLight);

	// Directional light for shadows
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
	directionalLight.position.set(50, 100, 50);
	directionalLight.castShadow = true;
	
	// Configure shadow properties
	directionalLight.shadow.mapSize.width = 2048;
	directionalLight.shadow.mapSize.height = 2048;
	directionalLight.shadow.camera.near = 0.5;
	directionalLight.shadow.camera.far = 500;
	directionalLight.shadow.camera.left = -50;
	directionalLight.shadow.camera.right = 50;
	directionalLight.shadow.camera.top = 50;
	directionalLight.shadow.camera.bottom = -50;
	
	scene.add(directionalLight);

	// Add a hemisphere light for more natural outdoor lighting
	const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x3e2c1f, 0.6);
	scene.add(hemisphereLight);
}

/**
 * Clean up the renderer and its resources
 */
export function cleanup() {
	if (!isInitialized) return;

	// Dispose of materials
	Object.values(materials).forEach(material => {
		if (material.dispose) {
			material.dispose();
		}
	});

	// Dispose of geometries and materials in the scene
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

	// Remove event listeners
	window.removeEventListener('resize', () => {});

	// Dispose of renderer
	if (renderer) {
		renderer.dispose();
	}

	// Clear references
	scene = null;
	camera = null;
	renderer = null;
	controls = null;
	boardGroup = null;
	piecesGroup = null;
	tetrominoGroup = null;
	ghostGroup = null;
	decorationsGroup = null;
	uiGroup = null;
	materials = {};
	isInitialized = false;
}

// Export camera control functions
export function resetCamera() {
	if (!camera || !controls) return;
	camera.position.set(12, 15, 20);
	camera.lookAt(12, 0, 12);
	controls.update();
}

export function topView() {
	if (!camera || !controls) return;
	camera.position.set(12, 30, 12);
	camera.lookAt(12, 0, 12);
	controls.update();
}

export function sideView() {
	if (!camera || !controls) return;
	camera.position.set(30, 10, 12);
	camera.lookAt(12, 0, 12);
	controls.update();
} 