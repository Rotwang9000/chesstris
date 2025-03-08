/**
 * Renderer Module
 * 
 * Handles the rendering of the game using Three.js.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as GameState from '../core/gameState.js';
import * as Constants from '../core/constants.js';
import * as TetrominoManager from '../core/tetrominoManager.js';
import * as Helpers from '../utils/helpers.js';

// Three.js variables
let scene, camera, renderer, controls;
let boardGroup, piecesGroup, tetrominoGroup, uiGroup;

// Textures and materials
const materials = {};
const textures = {};

// Animation variables
let animationFrameId = null;
let lastRenderTime = 0;

/**
 * Initialize the renderer
 * @param {HTMLElement} container - The container element
 * @param {Object} options - Renderer options
 * @returns {Object} The renderer instance
 */
export function init(container, options = {}) {
	// Create the scene
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x121212);
	
	// Create the camera
	const width = container.clientWidth;
	const height = container.clientHeight;
	const aspect = width / height;
	camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
	camera.position.set(0, 10, 20);
	
	// Create the renderer
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(width, height);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.shadowMap.enabled = true;
	container.appendChild(renderer.domElement);
	
	// Create controls
	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;
	controls.screenSpacePanning = false;
	controls.minDistance = 5;
	controls.maxDistance = 50;
	controls.maxPolarAngle = Math.PI / 2;
	
	// Create groups
	boardGroup = new THREE.Group();
	piecesGroup = new THREE.Group();
	tetrominoGroup = new THREE.Group();
	uiGroup = new THREE.Group();
	
	scene.add(boardGroup);
	scene.add(piecesGroup);
	scene.add(tetrominoGroup);
	scene.add(uiGroup);
	
	// Add lights
	addLights();
	
	// Load textures
	loadTextures();
	
	// Add event listeners
	window.addEventListener('resize', onWindowResize);
	
	// Start the animation loop
	animate();
	
	return { scene, camera, renderer };
}

/**
 * Add lights to the scene
 */
function addLights() {
	// Ambient light
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
	scene.add(ambientLight);
	
	// Directional light (sun)
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
	directionalLight.position.set(10, 20, 10);
	directionalLight.castShadow = true;
	directionalLight.shadow.mapSize.width = 2048;
	directionalLight.shadow.mapSize.height = 2048;
	directionalLight.shadow.camera.near = 0.5;
	directionalLight.shadow.camera.far = 50;
	directionalLight.shadow.camera.left = -20;
	directionalLight.shadow.camera.right = 20;
	directionalLight.shadow.camera.top = 20;
	directionalLight.shadow.camera.bottom = -20;
	scene.add(directionalLight);
	
	// Point lights for atmosphere
	const pointLight1 = new THREE.PointLight(0x3498db, 1, 20);
	pointLight1.position.set(-10, 10, 5);
	scene.add(pointLight1);
	
	const pointLight2 = new THREE.PointLight(0xe74c3c, 1, 20);
	pointLight2.position.set(10, 10, -5);
	scene.add(pointLight2);
}

/**
 * Load textures
 */
function loadTextures() {
	const textureLoader = new THREE.TextureLoader();
	
	// Load board textures
	textures.board = textureLoader.load('/assets/textures/board.png');
	textures.cell = textureLoader.load('/assets/textures/cell.png');
	textures.homeZone = textureLoader.load('/assets/textures/home_zone.png');
	
	// Load chess piece textures
	textures.pawn = textureLoader.load('/assets/textures/pawn.png');
	textures.rook = textureLoader.load('/assets/textures/rook.png');
	textures.knight = textureLoader.load('/assets/textures/knight.png');
	textures.bishop = textureLoader.load('/assets/textures/bishop.png');
	textures.queen = textureLoader.load('/assets/textures/queen.png');
	textures.king = textureLoader.load('/assets/textures/king.png');
	
	// Create materials
	materials.board = new THREE.MeshStandardMaterial({
		map: textures.board,
		roughness: 0.8,
		metalness: 0.2
	});
	
	materials.cell = new THREE.MeshStandardMaterial({
		map: textures.cell,
		transparent: true,
		roughness: 0.5,
		metalness: 0.3
	});
	
	materials.homeZone = new THREE.MeshStandardMaterial({
		map: textures.homeZone,
		transparent: true,
		roughness: 0.3,
		metalness: 0.5
	});
	
	// Create tetromino materials
	Object.keys(Constants.TETROMINOES).forEach(type => {
		const color = Constants.TETROMINOES[type].color;
		materials[`tetromino_${type}`] = new THREE.MeshStandardMaterial({
			color: new THREE.Color(color),
			roughness: 0.7,
			metalness: 0.3
		});
	});
}

/**
 * Handle window resize
 */
function onWindowResize() {
	const container = renderer.domElement.parentElement;
	const width = container.clientWidth;
	const height = container.clientHeight;
	
	camera.aspect = width / height;
	camera.updateProjectionMatrix();
	
	renderer.setSize(width, height);
}

/**
 * Animation loop
 */
function animate(time = 0) {
	animationFrameId = requestAnimationFrame(animate);
	
	// Calculate delta time
	const deltaTime = time - lastRenderTime;
	lastRenderTime = time;
	
	// Update controls
	controls.update();
	
	// Update the scene
	updateScene(deltaTime);
	
	// Render the scene
	renderer.render(scene, camera);
}

/**
 * Update the scene
 * @param {number} deltaTime - Time since last update in ms
 */
function updateScene(deltaTime) {
	const gameState = GameState.getGameState();
	
	// Update board
	updateBoard();
	
	// Update chess pieces
	updateChessPieces();
	
	// Update falling tetromino
	updateFallingTetromino();
	
	// Update ghost piece
	updateGhostPiece();
	
	// Update UI elements
	updateUI();
}

/**
 * Update the game board
 */
function updateBoard() {
	// Clear the board group
	while (boardGroup.children.length > 0) {
		boardGroup.remove(boardGroup.children[0]);
	}
	
	const gameState = GameState.getGameState();
	
	// Create the board base
	const boardGeometry = new THREE.BoxGeometry(
		Constants.INITIAL_BOARD_WIDTH * Constants.CELL_SIZE,
		1,
		Constants.INITIAL_BOARD_HEIGHT * Constants.CELL_SIZE
	);
	const boardMesh = new THREE.Mesh(boardGeometry, materials.board);
	boardMesh.position.y = -0.5;
	boardMesh.receiveShadow = true;
	boardGroup.add(boardMesh);
	
	// Create cells
	Object.values(gameState.board).forEach(cell => {
		// Create cell mesh
		const cellGeometry = new THREE.BoxGeometry(
			Constants.CELL_SIZE * 0.95,
			Constants.CELL_HEIGHT,
			Constants.CELL_SIZE * 0.95
		);
		
		// Determine cell material
		let cellMaterial;
		if (cell.homeZone) {
			// Home zone cell
			const playerColor = gameState.players[cell.homeZone.playerId]?.color || 0xffffff;
			cellMaterial = materials.homeZone.clone();
			cellMaterial.color = new THREE.Color(playerColor);
			cellMaterial.opacity = 0.7;
		} else if (cell.block) {
			// Tetromino block
			cellMaterial = materials[`tetromino_${cell.block.type}`] || materials.cell;
		} else {
			// Empty cell
			cellMaterial = materials.cell.clone();
			cellMaterial.opacity = 0.3;
		}
		
		const cellMesh = new THREE.Mesh(cellGeometry, cellMaterial);
		cellMesh.position.set(
			cell.x * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_WIDTH * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2,
			Constants.CELL_HEIGHT / 2,
			cell.y * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_HEIGHT * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2
		);
		cellMesh.castShadow = true;
		cellMesh.receiveShadow = true;
		
		// Add cell to board group
		boardGroup.add(cellMesh);
		
		// Add potion if present
		if (cell.potion) {
			addPotionToCell(cell);
		}
	});
}

/**
 * Add a potion to a cell
 * @param {Object} cell - The cell object
 */
function addPotionToCell(cell) {
	const potionGeometry = new THREE.SphereGeometry(Constants.CELL_SIZE * 0.3, 16, 16);
	
	// Determine potion color based on type
	let potionColor;
	switch (cell.potion.type) {
		case Constants.POTION_TYPES.SPEED:
			potionColor = 0x3498db; // Blue
			break;
		case Constants.POTION_TYPES.JUMP:
			potionColor = 0x2ecc71; // Green
			break;
		case Constants.POTION_TYPES.SHIELD:
			potionColor = 0xf1c40f; // Yellow
			break;
		case Constants.POTION_TYPES.GROW:
			potionColor = 0xe74c3c; // Red
			break;
		default:
			potionColor = 0x9b59b6; // Purple
	}
	
	const potionMaterial = new THREE.MeshStandardMaterial({
		color: potionColor,
		roughness: 0.2,
		metalness: 0.8,
		transparent: true,
		opacity: 0.8
	});
	
	const potionMesh = new THREE.Mesh(potionGeometry, potionMaterial);
	potionMesh.position.set(
		cell.x * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_WIDTH * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2,
		Constants.CELL_HEIGHT + Constants.CELL_SIZE * 0.3,
		cell.y * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_HEIGHT * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2
	);
	potionMesh.castShadow = true;
	
	// Add animation
	potionMesh.userData.animation = {
		hover: {
			speed: 0.001,
			height: 0.2,
			rotation: 0.01,
			time: Math.random() * Math.PI * 2
		}
	};
	
	boardGroup.add(potionMesh);
}

/**
 * Update chess pieces
 */
function updateChessPieces() {
	// Clear the pieces group
	while (piecesGroup.children.length > 0) {
		piecesGroup.remove(piecesGroup.children[0]);
	}
	
	const gameState = GameState.getGameState();
	
	// Add chess pieces for each player
	Object.values(gameState.players).forEach(player => {
		player.pieces.forEach(piece => {
			addChessPiece(piece, player);
		});
	});
}

/**
 * Add a chess piece to the scene
 * @param {Object} piece - The piece object
 * @param {Object} player - The player object
 */
function addChessPiece(piece, player) {
	// Determine piece geometry based on type
	let pieceGeometry;
	switch (piece.type) {
		case Constants.CHESS_PIECE_TYPES.PAWN:
			pieceGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8);
			break;
		case Constants.CHESS_PIECE_TYPES.ROOK:
			pieceGeometry = new THREE.BoxGeometry(0.6, 1, 0.6);
			break;
		case Constants.CHESS_PIECE_TYPES.KNIGHT:
			// Create a more complex knight shape
			const knightGroup = new THREE.Group();
			const baseGeometry = new THREE.CylinderGeometry(0.4, 0.5, 0.6, 8);
			const base = new THREE.Mesh(baseGeometry, new THREE.MeshStandardMaterial({ color: player.color }));
			base.position.y = 0.3;
			knightGroup.add(base);
			
			const headGeometry = new THREE.BoxGeometry(0.3, 0.5, 0.7);
			const head = new THREE.Mesh(headGeometry, new THREE.MeshStandardMaterial({ color: player.color }));
			head.position.set(0, 0.8, 0.1);
			head.rotation.x = Math.PI / 6;
			knightGroup.add(head);
			
			pieceGeometry = knightGroup;
			break;
		case Constants.CHESS_PIECE_TYPES.BISHOP:
			pieceGeometry = new THREE.ConeGeometry(0.4, 1.2, 8);
			break;
		case Constants.CHESS_PIECE_TYPES.QUEEN:
			pieceGeometry = new THREE.CylinderGeometry(0.3, 0.5, 1.3, 8);
			break;
		case Constants.CHESS_PIECE_TYPES.KING:
			// Create a more complex king shape
			const kingGroup = new THREE.Group();
			const kingBaseGeometry = new THREE.CylinderGeometry(0.4, 0.5, 1, 8);
			const kingBase = new THREE.Mesh(kingBaseGeometry, new THREE.MeshStandardMaterial({ color: player.color }));
			kingBase.position.y = 0.5;
			kingGroup.add(kingBase);
			
			const crownGeometry = new THREE.BoxGeometry(0.8, 0.3, 0.8);
			const crown = new THREE.Mesh(crownGeometry, new THREE.MeshStandardMaterial({ color: player.color }));
			crown.position.y = 1.2;
			kingGroup.add(crown);
			
			const crossGeometry = new THREE.BoxGeometry(0.2, 0.4, 0.2);
			const cross = new THREE.Mesh(crossGeometry, new THREE.MeshStandardMaterial({ color: player.color }));
			cross.position.y = 1.55;
			kingGroup.add(cross);
			
			pieceGeometry = kingGroup;
			break;
		default:
			pieceGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
	}
	
	// Create the piece mesh or use the group
	let pieceMesh;
	if (pieceGeometry instanceof THREE.Group) {
		pieceMesh = pieceGeometry;
	} else {
		const pieceMaterial = new THREE.MeshStandardMaterial({
			color: player.color,
			roughness: 0.5,
			metalness: 0.5
		});
		pieceMesh = new THREE.Mesh(pieceGeometry, pieceMaterial);
	}
	
	// Position the piece
	pieceMesh.position.set(
		piece.x * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_WIDTH * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2,
		Constants.CELL_HEIGHT + (piece.type === Constants.CHESS_PIECE_TYPES.KING ? 0.65 : 0.4),
		piece.y * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_HEIGHT * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2
	);
	
	pieceMesh.castShadow = true;
	pieceMesh.userData.piece = piece;
	
	piecesGroup.add(pieceMesh);
}

/**
 * Update the falling tetromino
 */
function updateFallingTetromino() {
	// Clear the tetromino group
	while (tetrominoGroup.children.length > 0) {
		tetrominoGroup.remove(tetrominoGroup.children[0]);
	}
	
	const gameState = GameState.getGameState();
	const { fallingPiece } = gameState;
	
	if (!fallingPiece) {
		return;
	}
	
	// Create a group for the tetromino
	const tetrominoGroup3D = new THREE.Group();
	
	// Add blocks to the tetromino
	fallingPiece.blocks.forEach(block => {
		const blockGeometry = new THREE.BoxGeometry(
			Constants.CELL_SIZE * 0.9,
			Constants.CELL_SIZE * 0.9,
			Constants.CELL_SIZE * 0.9
		);
		
		const blockMaterial = materials[`tetromino_${fallingPiece.type}`] || 
			new THREE.MeshStandardMaterial({
				color: fallingPiece.color,
				roughness: 0.7,
				metalness: 0.3
			});
		
		const blockMesh = new THREE.Mesh(blockGeometry, blockMaterial);
		
		blockMesh.position.set(
			(fallingPiece.x + block.x) * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_WIDTH * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2,
			Constants.CELL_HEIGHT + Constants.CELL_SIZE / 2 + Constants.PIECE_HOVER_HEIGHT,
			(fallingPiece.y + block.y) * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_HEIGHT * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2
		);
		
		blockMesh.castShadow = true;
		tetrominoGroup3D.add(blockMesh);
	});
	
	// Add sponsor logo if available
	if (fallingPiece.sponsor) {
		// This would load and display a sponsor texture
		// For now, we'll just add a simple indicator
		const sponsorGeometry = new THREE.PlaneGeometry(
			Constants.CELL_SIZE * 1.5,
			Constants.CELL_SIZE * 0.5
		);
		
		const sponsorMaterial = new THREE.MeshBasicMaterial({
			color: 0xffffff,
			transparent: true,
			opacity: 0.8,
			side: THREE.DoubleSide
		});
		
		const sponsorMesh = new THREE.Mesh(sponsorGeometry, sponsorMaterial);
		
		// Position above the tetromino
		sponsorMesh.position.set(
			fallingPiece.x * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_WIDTH * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2,
			Constants.CELL_HEIGHT + Constants.CELL_SIZE * 2,
			fallingPiece.y * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_HEIGHT * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2
		);
		
		// Rotate to face the camera
		sponsorMesh.rotation.x = -Math.PI / 2;
		
		tetrominoGroup3D.add(sponsorMesh);
	}
	
	tetrominoGroup.add(tetrominoGroup3D);
}

/**
 * Update the ghost piece (preview of where the tetromino will land)
 */
function updateGhostPiece() {
	const ghostPiece = TetrominoManager.getGhostPiece();
	
	if (!ghostPiece) {
		return;
	}
	
	// Create a group for the ghost piece
	const ghostGroup = new THREE.Group();
	
	// Add blocks to the ghost piece
	ghostPiece.blocks.forEach(block => {
		const blockGeometry = new THREE.BoxGeometry(
			Constants.CELL_SIZE * 0.8,
			Constants.CELL_SIZE * 0.8,
			Constants.CELL_SIZE * 0.8
		);
		
		const blockMaterial = new THREE.MeshStandardMaterial({
			color: ghostPiece.color,
			roughness: 0.7,
			metalness: 0.3,
			transparent: true,
			opacity: 0.3
		});
		
		const blockMesh = new THREE.Mesh(blockGeometry, blockMaterial);
		
		blockMesh.position.set(
			(ghostPiece.x + block.x) * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_WIDTH * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2,
			Constants.CELL_HEIGHT + Constants.CELL_SIZE / 2,
			(ghostPiece.y + block.y) * Constants.CELL_SIZE - (Constants.INITIAL_BOARD_HEIGHT * Constants.CELL_SIZE) / 2 + Constants.CELL_SIZE / 2
		);
		
		ghostGroup.add(blockMesh);
	});
	
	tetrominoGroup.add(ghostGroup);
}

/**
 * Update UI elements
 */
function updateUI() {
	// This would update any 3D UI elements
	// For now, we'll leave it empty as UI is typically handled in HTML/CSS
}

/**
 * Clean up the renderer
 */
export function cleanup() {
	// Stop the animation loop
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
	}
	
	// Remove event listeners
	window.removeEventListener('resize', onWindowResize);
	
	// Dispose of geometries and materials
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
	
	// Dispose of the renderer
	renderer.dispose();
}

export default {
	init,
	cleanup
}; 