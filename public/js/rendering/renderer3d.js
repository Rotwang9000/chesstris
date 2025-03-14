/**
 * 3D Renderer
 * 
 * Handles 3D rendering using Three.js.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GAME_CONSTANTS } from '../core/constants.js';

// Three.js components
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let raycaster = null;
let mouse = null;

// Game objects
let board = null;
let tetrominos = {};
let chessPieces = {};
let homeZones = {};

// Visual effects
let particles = [];
let lights = [];
let skybox = null;

// Debug helpers
let debugMode = false;
let axesHelper = null;
let gridHelper = null;
let stats = null;

// Canvas element
let canvas = null;

// Animation
let animationFrame = null;
let clock = null;

// Materials
const materials = {
	board: null,
	grid: null,
	tetromino: {},
	chessPiece: {},
	homeZone: {},
	particle: null
};

// Colors
const COLORS = {
	background: 0x1a1a2e,
	board: 0x333333,
	grid: 0x444444,
	ambient: 0xffffff,
	directional: 0xffffff,
	point: 0x00ffff,
	particle: 0x88ccff
};

/**
 * Initialize the 3D renderer
 * @param {HTMLCanvasElement} canvasElement - Canvas element
 * @returns {Promise<void>}
 */
export async function init(canvasElement) {
	try {
		console.log('Initializing 3D renderer');
		
		// Store canvas
		canvas = canvasElement;
		
		// Initialize clock
		clock = new THREE.Clock();
		
		// Create scene
		scene = new THREE.Scene();
		scene.background = new THREE.Color(COLORS.background);
		scene.fog = new THREE.FogExp2(COLORS.background, 0.02);
		
		// Create camera
		const aspect = canvas.clientWidth / canvas.clientHeight;
		camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
		camera.position.set(15, 20, 30);
		camera.lookAt(0, 0, 0);
		
		// Create renderer
		renderer = new THREE.WebGLRenderer({ 
			canvas: canvas,
			antialias: true,
			alpha: true
		});
		renderer.setSize(canvas.clientWidth, canvas.clientHeight);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		renderer.outputEncoding = THREE.sRGBEncoding;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.2;
		
		// Create controls
		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.25;
		controls.screenSpacePanning = false;
		controls.maxPolarAngle = Math.PI / 2;
		controls.minDistance = 10;
		controls.maxDistance = 50;
		
		// Create raycaster for mouse interaction
		raycaster = new THREE.Raycaster();
		mouse = new THREE.Vector2();
		
		// Initialize materials
		initMaterials();
		
		// Add lights
		addLights();
		
		// Create skybox
		createSkybox();
		
		// Create board
		createBoard();
		
		// Add particles
		addParticles();
		
		// Add debug helpers if in debug mode
		if (debugMode) {
			addDebugHelpers();
		}
		
		// Handle window resize
		window.addEventListener('resize', handleResize);
		
		console.log('3D renderer initialized');
	} catch (error) {
		console.error('Error initializing 3D renderer:', error);
		throw error;
	}
}

/**
 * Initialize materials
 */
function initMaterials() {
	try {
		// Board material
		materials.board = new THREE.MeshStandardMaterial({ 
			color: COLORS.board,
			roughness: 0.8,
			metalness: 0.2
		});
		
		// Grid material
		materials.grid = new THREE.LineBasicMaterial({ 
			color: COLORS.grid,
			transparent: true,
			opacity: 0.5
		});
		
		// Particle material
		materials.particle = new THREE.PointsMaterial({
			color: COLORS.particle,
			size: 0.5,
			transparent: true,
			opacity: 0.7,
			blending: THREE.AdditiveBlending,
			depthWrite: false
		});
	} catch (error) {
		console.error('Error initializing materials:', error);
	}
}

/**
 * Add lights to the scene
 */
function addLights() {
	try {
		// Ambient light
		const ambientLight = new THREE.AmbientLight(COLORS.ambient, 0.5);
		scene.add(ambientLight);
		lights.push(ambientLight);
		
		// Directional light (sun)
		const directionalLight = new THREE.DirectionalLight(COLORS.directional, 0.8);
		directionalLight.position.set(50, 200, 100);
		directionalLight.castShadow = true;
		directionalLight.shadow.mapSize.width = 2048;
		directionalLight.shadow.mapSize.height = 2048;
		directionalLight.shadow.camera.near = 0.5;
		directionalLight.shadow.camera.far = 500;
		directionalLight.shadow.camera.left = -50;
		directionalLight.shadow.camera.right = 50;
		directionalLight.shadow.camera.top = 50;
		directionalLight.shadow.camera.bottom = -50;
		directionalLight.shadow.bias = -0.0001;
		scene.add(directionalLight);
		lights.push(directionalLight);
		
		// Point light (center of board)
		const pointLight = new THREE.PointLight(COLORS.point, 0.8, 50);
		pointLight.position.set(0, 10, 0);
		pointLight.castShadow = true;
		pointLight.shadow.mapSize.width = 1024;
		pointLight.shadow.mapSize.height = 1024;
		scene.add(pointLight);
		lights.push(pointLight);
		
		// Add some colored point lights around the board
		const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00];
		const positions = [
			[-20, 10, -20],
			[20, 10, -20],
			[-20, 10, 20],
			[20, 10, 20]
		];
		
		for (let i = 0; i < colors.length; i++) {
			const light = new THREE.PointLight(colors[i], 0.3, 50);
			light.position.set(...positions[i]);
			scene.add(light);
			lights.push(light);
		}
	} catch (error) {
		console.error('Error adding lights:', error);
	}
}

/**
 * Create skybox
 */
function createSkybox() {
	try {
		// Create a simple gradient skybox
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
			bottomColor: { value: new THREE.Color(0x000000) },
			offset: { value: 33 },
			exponent: { value: 0.6 }
		};
		
		const skyGeo = new THREE.SphereGeometry(400, 32, 15);
		const skyMat = new THREE.ShaderMaterial({
			uniforms: uniforms,
			vertexShader: vertexShader,
			fragmentShader: fragmentShader,
			side: THREE.BackSide
		});
		
		skybox = new THREE.Mesh(skyGeo, skyMat);
		scene.add(skybox);
	} catch (error) {
		console.error('Error creating skybox:', error);
	}
}

/**
 * Create the game board
 */
function createBoard() {
	try {
		// Create board group
		board = new THREE.Group();
		
		// Create board base
		const boardWidth = GAME_CONSTANTS.BOARD_WIDTH;
		const boardHeight = GAME_CONSTANTS.BOARD_HEIGHT;
		const boardGeometry = new THREE.BoxGeometry(boardWidth, 1, boardHeight);
		const boardMesh = new THREE.Mesh(boardGeometry, materials.board);
		boardMesh.position.set(boardWidth / 2 - 0.5, -0.5, boardHeight / 2 - 0.5);
		boardMesh.receiveShadow = true;
		board.add(boardMesh);
		
		// Create grid lines
		// Horizontal lines
		for (let z = 0; z <= boardHeight; z++) {
			const points = [
				new THREE.Vector3(0, 0, z),
				new THREE.Vector3(boardWidth, 0, z)
			];
			const geometry = new THREE.BufferGeometry().setFromPoints(points);
			const line = new THREE.Line(geometry, materials.grid);
			board.add(line);
		}
		
		// Vertical lines
		for (let x = 0; x <= boardWidth; x++) {
			const points = [
				new THREE.Vector3(x, 0, 0),
				new THREE.Vector3(x, 0, boardHeight)
			];
			const geometry = new THREE.BufferGeometry().setFromPoints(points);
			const line = new THREE.Line(geometry, materials.grid);
			board.add(line);
		}
		
		// Add board to scene
		scene.add(board);
		
		// Add a reflective floor beneath the board
		const floorGeometry = new THREE.PlaneGeometry(100, 100);
		const floorMaterial = new THREE.MeshStandardMaterial({
			color: 0x111111,
			roughness: 0.1,
			metalness: 0.5,
			side: THREE.DoubleSide
		});
		const floor = new THREE.Mesh(floorGeometry, floorMaterial);
		floor.rotation.x = -Math.PI / 2;
		floor.position.y = -1;
		floor.receiveShadow = true;
		scene.add(floor);
	} catch (error) {
		console.error('Error creating board:', error);
	}
}

/**
 * Add particles to the scene
 */
function addParticles() {
	try {
		// Create particle system
		const particleCount = 1000;
		const positions = new Float32Array(particleCount * 3);
		
		for (let i = 0; i < particleCount; i++) {
			const i3 = i * 3;
			positions[i3] = (Math.random() - 0.5) * 100;
			positions[i3 + 1] = Math.random() * 50;
			positions[i3 + 2] = (Math.random() - 0.5) * 100;
		}
		
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		
		const particleSystem = new THREE.Points(geometry, materials.particle);
		scene.add(particleSystem);
		particles.push(particleSystem);
	} catch (error) {
		console.error('Error adding particles:', error);
	}
}

/**
 * Add debug helpers to the scene
 */
function addDebugHelpers() {
	try {
		// Axes helper
		axesHelper = new THREE.AxesHelper(20);
		scene.add(axesHelper);
		
		// Grid helper
		gridHelper = new THREE.GridHelper(50, 50);
		scene.add(gridHelper);
		
		// Stats
		stats = new Stats();
		document.body.appendChild(stats.dom);
	} catch (error) {
		console.error('Error adding debug helpers:', error);
	}
}

/**
 * Handle window resize
 */
export function handleResize() {
	try {
		if (!camera || !renderer || !canvas) return;
		
		// Update camera aspect ratio
		camera.aspect = canvas.clientWidth / canvas.clientHeight;
		camera.updateProjectionMatrix();
		
		// Update renderer size
		renderer.setSize(canvas.clientWidth, canvas.clientHeight);
	} catch (error) {
		console.error('Error handling resize:', error);
	}
}

/**
 * Render the game
 * @param {Object} gameState - Current game state
 */
export function render(gameState) {
	try {
		if (!scene || !camera || !renderer) return;
		
		// Update controls
		if (controls) {
			controls.update();
		}
		
		// Update particles
		updateParticles();
		
		// Update lights
		updateLights();
		
		// Update game objects based on game state
		updateGameObjects(gameState);
		
		// Render scene
		renderer.render(scene, camera);
	} catch (error) {
		console.error('Error rendering game:', error);
	}
}

/**
 * Update particles
 */
function updateParticles() {
	try {
		const time = clock.getElapsedTime() * 0.1;
		
		// Update each particle system
		particles.forEach(particleSystem => {
			const positions = particleSystem.geometry.attributes.position.array;
			
			for (let i = 0; i < positions.length; i += 3) {
				// Slowly move particles upward
				positions[i + 1] += 0.01;
				
				// If particle is too high, reset it to the bottom
				if (positions[i + 1] > 50) {
					positions[i + 1] = 0;
				}
				
				// Add some gentle wave motion
				positions[i] += Math.sin(time + positions[i]) * 0.01;
				positions[i + 2] += Math.cos(time + positions[i + 2]) * 0.01;
			}
			
			particleSystem.geometry.attributes.position.needsUpdate = true;
		});
	} catch (error) {
		console.error('Error updating particles:', error);
	}
}

/**
 * Update lights
 */
function updateLights() {
	try {
		const time = clock.getElapsedTime();
		
		// Update point lights (excluding the first two which are ambient and directional)
		for (let i = 2; i < lights.length; i++) {
			const light = lights[i];
			
			// Make lights pulse
			light.intensity = 0.3 + Math.sin(time * 2 + i) * 0.1;
			
			// Make lights orbit slightly
			const radius = 20;
			const angle = time * 0.5 + (i * Math.PI / 2);
			light.position.x = Math.cos(angle) * radius;
			light.position.z = Math.sin(angle) * radius;
		}
	} catch (error) {
		console.error('Error updating lights:', error);
	}
}

/**
 * Update game objects based on game state
 * @param {Object} gameState - Current game state
 */
function updateGameObjects(gameState) {
	try {
		if (!gameState) return;
		
		// Update tetrominos
		updateTetrominos(gameState.fallingPiece);
		
		// Update chess pieces
		updateChessPieces(gameState.board);
		
		// Update home zones
		updateHomeZones(gameState.homeZones);
	} catch (error) {
		console.error('Error updating game objects:', error);
	}
}

/**
 * Update tetrominos
 * @param {Object} fallingPiece - Current falling piece
 */
function updateTetrominos(fallingPiece) {
	try {
		// Clear existing tetrominos
		Object.values(tetrominos).forEach(tetromino => {
			if (tetromino.parent) {
				tetromino.parent.remove(tetromino);
			}
		});
		tetrominos = {};
		
		// If no falling piece, return
		if (!fallingPiece) return;
		
		// Create tetromino group
		const tetromino = new THREE.Group();
		
		// Get tetromino shape and color
		const shape = fallingPiece.shape;
		const colorHex = fallingPiece.color || 0x00ff00;
		const color = new THREE.Color(colorHex);
		
		// Create or get material for this color
		if (!materials.tetromino[colorHex]) {
			materials.tetromino[colorHex] = new THREE.MeshStandardMaterial({ 
				color: color,
				roughness: 0.7,
				metalness: 0.3,
				emissive: color,
				emissiveIntensity: 0.2
			});
		}
		
		// Create blocks
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					// Create a slightly rounded cube for each block
					const blockGeometry = new THREE.BoxGeometry(0.95, 0.95, 0.95, 2, 2, 2);
					// Round the edges
					for (let i = 0; i < blockGeometry.attributes.position.array.length; i += 3) {
						const x = blockGeometry.attributes.position.array[i];
						const y = blockGeometry.attributes.position.array[i + 1];
						const z = blockGeometry.attributes.position.array[i + 2];
						const length = Math.sqrt(x * x + y * y + z * z);
						const factor = 0.95 / length;
						blockGeometry.attributes.position.array[i] *= factor;
						blockGeometry.attributes.position.array[i + 1] *= factor;
						blockGeometry.attributes.position.array[i + 2] *= factor;
					}
					
					const block = new THREE.Mesh(blockGeometry, materials.tetromino[colorHex]);
					block.position.set(x, 0, y);
					block.castShadow = true;
					block.receiveShadow = true;
					tetromino.add(block);
					
					// Add a point light inside the block for glow effect
					const light = new THREE.PointLight(color, 0.5, 2);
					light.position.set(x, 0, y);
					tetromino.add(light);
				}
			}
		}
		
		// Position tetromino
		tetromino.position.set(fallingPiece.x, 0, fallingPiece.y);
		
		// Add to scene
		scene.add(tetromino);
		
		// Store tetromino
		tetrominos[fallingPiece.id || 'current'] = tetromino;
	} catch (error) {
		console.error('Error updating tetrominos:', error);
	}
}

/**
 * Update chess pieces
 * @param {Array} board - Game board
 */
function updateChessPieces(board) {
	try {
		// Clear existing chess pieces
		Object.values(chessPieces).forEach(piece => {
			if (piece.parent) {
				piece.parent.remove(piece);
			}
		});
		chessPieces = {};
		
		// If no board, return
		if (!board) return;
		
		// Create chess pieces
		for (let z = 0; z < board.length; z++) {
			for (let x = 0; x < board[z].length; x++) {
				const cell = board[z][x];
				if (cell && cell.type && cell.type.includes('chess')) {
					createChessPiece(cell, x, z);
				}
			}
		}
	} catch (error) {
		console.error('Error updating chess pieces:', error);
	}
}

/**
 * Create a chess piece
 * @param {Object} piece - Chess piece data
 * @param {number} x - X position
 * @param {number} z - Z position
 */
function createChessPiece(piece, x, z) {
	try {
		// Get piece type and color
		const type = piece.type.replace('chess_', '');
		const colorHex = piece.color || 0xffffff;
		const color = new THREE.Color(colorHex);
		
		// Create or get material for this color
		if (!materials.chessPiece[colorHex]) {
			materials.chessPiece[colorHex] = new THREE.MeshStandardMaterial({ 
				color: color,
				roughness: 0.5,
				metalness: 0.7,
				emissive: color,
				emissiveIntensity: 0.1
			});
		}
		
		// Create piece geometry based on type
		let geometry;
		let height = 1;
		
		switch (type) {
			case 'pawn':
				geometry = new THREE.ConeGeometry(0.3, 0.8, 16);
				height = 0.4;
				break;
			case 'knight':
				geometry = new THREE.TorusKnotGeometry(0.3, 0.1, 64, 16);
				height = 0.5;
				break;
			case 'bishop':
				geometry = new THREE.ConeGeometry(0.4, 1, 16);
				height = 0.6;
				break;
			case 'rook':
				geometry = new THREE.BoxGeometry(0.6, 0.9, 0.6);
				height = 0.5;
				break;
			case 'queen':
				geometry = new THREE.DodecahedronGeometry(0.4, 2);
				height = 0.7;
				break;
			case 'king':
				geometry = new THREE.CylinderGeometry(0.3, 0.4, 1, 16);
				height = 0.8;
				break;
			default:
				geometry = new THREE.SphereGeometry(0.4, 16, 16);
				height = 0.4;
		}
		
		// Create piece group
		const pieceGroup = new THREE.Group();
		
		// Create piece mesh
		const pieceMesh = new THREE.Mesh(geometry, materials.chessPiece[colorHex]);
		pieceMesh.position.y = height / 2;
		pieceMesh.castShadow = true;
		pieceMesh.receiveShadow = true;
		pieceGroup.add(pieceMesh);
		
		// Add a base
		const baseGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);
		const baseMesh = new THREE.Mesh(baseGeometry, materials.chessPiece[colorHex]);
		baseMesh.position.y = 0.05;
		baseMesh.castShadow = true;
		baseMesh.receiveShadow = true;
		pieceGroup.add(baseMesh);
		
		// Position the piece group
		pieceGroup.position.set(x, 0, z);
		
		// Add to scene
		scene.add(pieceGroup);
		
		// Store chess piece
		chessPieces[`${piece.id || `${type}-${x}-${z}`}`] = pieceGroup;
	} catch (error) {
		console.error('Error creating chess piece:', error);
	}
}

/**
 * Update home zones
 * @param {Object} homeZones - Home zones data
 */
function updateHomeZones(homeZones) {
	try {
		// Clear existing home zones
		Object.values(homeZones).forEach(zone => {
			if (zone.parent) {
				zone.parent.remove(zone);
			}
		});
		homeZones = {};
		
		// If no home zones, return
		if (!homeZones) return;
		
		// Create home zones
		Object.entries(homeZones).forEach(([playerId, zone]) => {
			createHomeZone(playerId, zone);
		});
	} catch (error) {
		console.error('Error updating home zones:', error);
	}
}

/**
 * Create a home zone
 * @param {string} playerId - Player ID
 * @param {Object} zone - Home zone data
 */
function createHomeZone(playerId, zone) {
	try {
		// Get zone position and size
		const { x, y, width, height } = zone;
		const colorHex = zone.color || 0x0000ff;
		
		// Create or get material for this color
		if (!materials.homeZone[colorHex]) {
			materials.homeZone[colorHex] = new THREE.MeshBasicMaterial({ 
				color: colorHex,
				transparent: true,
				opacity: 0.2,
				side: THREE.DoubleSide
			});
		}
		
		// Create zone geometry
		const geometry = new THREE.PlaneGeometry(width, height);
		
		// Create zone mesh
		const zoneMesh = new THREE.Mesh(geometry, materials.homeZone[colorHex]);
		zoneMesh.rotation.x = -Math.PI / 2;
		zoneMesh.position.set(x + width / 2, 0.01, y + height / 2);
		
		// Add to scene
		scene.add(zoneMesh);
		
		// Store home zone
		homeZones[playerId] = zoneMesh;
	} catch (error) {
		console.error('Error creating home zone:', error);
	}
}

/**
 * Update the renderer
 * @param {number} deltaTime - Time since last update
 */
export function update(deltaTime) {
	try {
		// Nothing to update in the renderer itself
	} catch (error) {
		console.error('Error updating renderer:', error);
	}
}

/**
 * Clear the canvas
 */
export function clear() {
	try {
		// Nothing to clear in Three.js
	} catch (error) {
		console.error('Error clearing canvas:', error);
	}
}

/**
 * Set debug mode
 * @param {boolean} enabled - Whether debug mode is enabled
 */
export function setDebugMode(enabled) {
	try {
		debugMode = enabled;
		
		if (enabled) {
			// Add debug helpers
			addDebugHelpers();
		} else {
			// Remove debug helpers
			if (axesHelper) {
				scene.remove(axesHelper);
				axesHelper = null;
			}
			
			if (gridHelper) {
				scene.remove(gridHelper);
				gridHelper = null;
			}
			
			if (stats) {
				document.body.removeChild(stats.dom);
				stats = null;
			}
		}
	} catch (error) {
		console.error('Error setting debug mode:', error);
	}
}

/**
 * Dispose of renderer resources
 */
export function dispose() {
	try {
		// Cancel animation frame
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
			animationFrame = null;
		}
		
		// Remove event listeners
		window.removeEventListener('resize', handleResize);
		
		// Dispose of Three.js resources
		if (renderer) {
			renderer.dispose();
			renderer = null;
		}
		
		// Clear references
		scene = null;
		camera = null;
		controls = null;
		raycaster = null;
		mouse = null;
		board = null;
		tetrominos = {};
		chessPieces = {};
		homeZones = {};
		particles = [];
		lights = [];
		skybox = null;
		axesHelper = null;
		gridHelper = null;
		canvas = null;
		clock = null;
	} catch (error) {
		console.error('Error disposing renderer:', error);
	}
} 