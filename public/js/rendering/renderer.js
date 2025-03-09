/**
 * Renderer Module
 * 
 * Handles the rendering of the game using Three.js.
 */

import * as THREE from '../utils/three.js';
import { 
	Scene, 
	PerspectiveCamera, 
	WebGLRenderer, 
	Group, 
	Object3D,
	Mesh,
	Vector3, 
	Color, 
	AmbientLight, 
	DirectionalLight,
	PointLight,
	SpotLight,
	SphereGeometry,
	BoxGeometry,
	PlaneGeometry,
	CylinderGeometry,
	ConeGeometry,
	MeshBasicMaterial,
	MeshStandardMaterial,
	MeshLambertMaterial,
	MeshPhongMaterial,
	TextureLoader,
	Raycaster,
	DoubleSide,
	OrbitControls
} from '../utils/three.js';

import * as GameState from '../core/gameState.js';
import * as Constants from '../core/constants.js';
import * as TetrominoManager from '../core/tetrominoManager.js';
import * as Helpers from '../utils/helpers.js';

// Three.js variables
let scene, camera, renderer, controls;
let boardGroup, piecesGroup, tetrominoGroup, uiGroup;

// Textures and materials
const textures = {};
const materials = {};

// Animation variables
let animationFrameId;
let lastRenderTime = 0;

/**
 * Initialize the renderer
 * @param {HTMLElement} container - The container element
 * @param {Object} options - Renderer options
 * @returns {Object} The renderer instance
 */
export function init(container, options = {}) {
	try {
		// Create the scene
		scene = new Scene();
		scene.background = new Color(0x121212);
		
		// Create the camera
		const width = container.clientWidth;
		const height = container.clientHeight;
		const aspect = width / height;
		camera = new PerspectiveCamera(60, aspect, 0.1, 1000);
		camera.position.set(0, 10, 20);
		
		// Create the renderer
		renderer = new WebGLRenderer({ antialias: true });
		renderer.setSize(width, height);
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.shadowMap.enabled = true;
		container.appendChild(renderer.domElement);
		
		// Add orbit controls
		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.screenSpacePanning = false;
		controls.minDistance = 5;
		controls.maxDistance = 50;
		controls.maxPolarAngle = Math.PI / 2;
		
		// Create groups
		boardGroup = new Group();
		piecesGroup = new Group();
		tetrominoGroup = new Group();
		uiGroup = new Group();
		
		scene.add(boardGroup);
		scene.add(piecesGroup);
		scene.add(tetrominoGroup);
		scene.add(uiGroup);
		
		// Add lights
		addLights();
		
		// Load textures
		loadTextures();
		
		// Initialize game state if it doesn't exist
		const gameState = GameState.getGameState();
		if (!gameState || !gameState.board) {
			console.log('Initializing default game state for rendering');
			// Create a minimal game state with an empty board if none exists
			GameState.initGameState({
				board: Array(Constants.INITIAL_BOARD_HEIGHT).fill().map(() => 
					Array(Constants.INITIAL_BOARD_WIDTH).fill(null)
				)
			});
		}
		
		// Add event listeners
		window.addEventListener('resize', onWindowResize);
		
		// Reset render timing
		lastRenderTime = performance.now();
		
		// Start the animation loop
		animate();
		
		console.log('Renderer initialized successfully');
		return { scene, camera, renderer };
	} catch (error) {
		console.error('Error initializing renderer:', error);
		throw error;
	}
}

/**
 * Add lights to the scene
 */
function addLights() {
	// Ambient light
	const ambientLight = new AmbientLight(0xffffff, 0.5);
	scene.add(ambientLight);
	
	// Directional light (sun)
	const directionalLight = new DirectionalLight(0xffffff, 0.8);
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
	
	// Blue point light
	const pointLight1 = new PointLight(0x3498db, 1, 20);
	pointLight1.position.set(-5, 10, 5);
	scene.add(pointLight1);
	
	// Red point light
	const pointLight2 = new PointLight(0xe74c3c, 1, 20);
	pointLight2.position.set(5, 10, -5);
	scene.add(pointLight2);
}

/**
 * Load textures and create materials
 */
function loadTextures() {
	const textureLoader = new TextureLoader();
	
	// Create materials with fallback colors in case textures are missing
	materials.board = new MeshStandardMaterial({
		color: 0x333333,
		roughness: 0.8,
		metalness: 0.2
	});
	
	materials.cell = new MeshStandardMaterial({
		color: 0x555555,
		roughness: 0.5,
		metalness: 0.1
	});
	
	materials.homeZone = new MeshStandardMaterial({
		color: 0x444444,
		transparent: true,
		opacity: 0.8
	});
	
	// Chess piece materials
	materials.chessPieceWhite = new MeshStandardMaterial({
		color: 0xFFFFFF,
		roughness: 0.5,
		metalness: 0.1
	});
	
	materials.chessPieceBlack = new MeshStandardMaterial({
		color: 0x333333,
		roughness: 0.5,
		metalness: 0.1
	});
	
	// Create tetromino materials for each type
	// Use the keys from TETROMINO_COLORS instead of TETROMINO_TYPES
	Object.keys(Constants.TETROMINO_COLORS).forEach(type => {
		const color = Constants.TETROMINO_COLORS[type];
		materials[`tetromino_${type}`] = new MeshStandardMaterial({
			color: new Color(color),
			roughness: 0.7,
			metalness: 0.3
		});
	});
	
	// Try to load textures in the background, but don't rely on them
	try {
		// Load board textures
		textureLoader.load('/assets/textures/board.png', 
			texture => { materials.board.map = texture; materials.board.needsUpdate = true; },
			undefined,
			error => console.warn('Failed to load board texture:', error)
		);
		
		textureLoader.load('/assets/textures/cell.png', 
			texture => { materials.cell.map = texture; materials.cell.needsUpdate = true; },
			undefined,
			error => console.warn('Failed to load cell texture:', error)
		);
		
		textureLoader.load('/assets/textures/home_zone.png', 
			texture => { materials.homeZone.map = texture; materials.homeZone.needsUpdate = true; },
			undefined,
			error => console.warn('Failed to load home zone texture:', error)
		);
	} catch (error) {
		console.warn('Error loading textures:', error);
	}
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
	try {
		animationFrameId = requestAnimationFrame(animate);
		
		// Calculate delta time
		const deltaTime = time - lastRenderTime;
		lastRenderTime = time;
		
		// Update controls
		if (controls) {
			controls.update();
		}
		
		// Update the scene
		updateScene(deltaTime);
		
		// Render the scene
		if (renderer && scene && camera) {
			renderer.render(scene, camera);
		}
	} catch (error) {
		console.error('Error in animation loop:', error);
		// Don't stop the animation loop on error
	}
}

/**
 * Update the scene
 * @param {number} deltaTime - Time since last update in ms
 */
function updateScene(deltaTime) {
	try {
		// Update board
		updateBoard();
		
		// Update chess pieces
		updateChessPieces();
		
		// Update falling tetromino
		updateFallingTetromino();
		
		// Update ghost piece
		updateGhostPiece();
		
		// Update UI
		updateUI();
	} catch (error) {
		console.error('Error updating scene:', error);
	}
}

/**
 * Update the board visualization
 */
function updateBoard() {
	// Clear existing board
	while (boardGroup.children.length > 0) {
		boardGroup.remove(boardGroup.children[0]);
	}
	
	const gameState = GameState.getGameState();
	if (!gameState || !gameState.board) {
		console.warn('No game state or board available for rendering');
		return;
	}
	
	if (!Array.isArray(gameState.board) || gameState.board.length === 0) {
		console.warn('Game board is empty or not an array');
		return;
	}
	
	// For empty rows, initialize board with default dimensions
	if (!gameState.board[0] || !Array.isArray(gameState.board[0])) {
		console.warn('First row of board is empty or not an array');
		
		// Create a fallback board with minimum dimensions
		const fallbackWidth = Constants.INITIAL_BOARD_WIDTH * Constants.CELL_SIZE;
		const fallbackHeight = Constants.INITIAL_BOARD_HEIGHT * Constants.CELL_SIZE;
		const boardDepth = Constants.CELL_SIZE * 0.5;
		
		const boardGeometry = new BoxGeometry(
			fallbackWidth,
			boardDepth,
			fallbackHeight
		);
		
		const boardMesh = new Mesh(boardGeometry, materials.board);
		boardMesh.position.set(0, -boardDepth / 2, 0);
		boardMesh.receiveShadow = true;
		boardGroup.add(boardMesh);
		
		return;
	}
	
	// Create the main board
	const boardWidth = gameState.board[0].length * Constants.CELL_SIZE;
	const boardHeight = gameState.board.length * Constants.CELL_SIZE;
	const boardDepth = Constants.CELL_SIZE * 0.5;
	
	const boardGeometry = new BoxGeometry(
		boardWidth,
		boardDepth,
		boardHeight
	);
	
	const boardMesh = new Mesh(boardGeometry, materials.board);
	boardMesh.position.set(0, -boardDepth / 2, 0);
	boardMesh.receiveShadow = true;
	boardGroup.add(boardMesh);
	
	// Create cells
	const cellSize = Constants.CELL_SIZE;
	const cellHeight = Constants.CELL_SIZE * 0.1;
	const cellGeometry = new BoxGeometry(
		cellSize * 0.95,
		cellHeight,
		cellSize * 0.95
	);
	
	// Add all cells to the board
	try {
		gameState.board.forEach((row, y) => {
			if (!Array.isArray(row)) {
				console.warn(`Row ${y} is not an array, skipping`);
				return;
			}
			
			row.forEach((cell, x) => {
				if (!cell) return; // Skip empty cells
				
				const cellMaterial = materials.cell.clone();
				const playerColor = cell.color || 0xCCCCCC;
				cellMaterial.color = new Color(playerColor);
				
				// If this is a home zone cell, use a different material
				if (cell.isHomeZone) {
					cellMaterial.opacity = 0.7;
					cellMaterial.transparent = true;
				}
				
				const cellX = (x - (row.length - 1) / 2) * cellSize;
				const cellZ = (y - (gameState.board.length - 1) / 2) * cellSize;
				
				const cellMesh = new Mesh(cellGeometry, cellMaterial);
				cellMesh.position.set(cellX, 0, cellZ);
				cellMesh.receiveShadow = true;
				boardGroup.add(cellMesh);
				
				// Add potion if this cell has one
				if (cell.potion) {
					addPotionToCell(cell);
				}
			});
		});
	} catch (error) {
		console.error('Error rendering board cells:', error);
	}
}

/**
 * Add a potion visual to a cell
 * @param {Object} cell - The cell data containing the potion
 */
function addPotionToCell(cell) {
	// Create a sphere for the potion
	const potionGeometry = new SphereGeometry(Constants.CELL_SIZE * 0.3, 16, 16);
	
	// Determine potion color based on type
	let potionColor;
	switch (cell.potion.type) {
		case 'speed':
			potionColor = 0x3498db; // Blue for speed
			break;
		case 'power':
			potionColor = 0xe74c3c; // Red for power
			break;
		case 'freeze':
			potionColor = 0x2ecc71; // Green for freeze
			break;
		default:
			potionColor = 0xf1c40f; // Yellow for unknown
	}
	
	// Create emissive material for the potion to make it glow
	const potionMaterial = new MeshStandardMaterial({
		color: potionColor,
		emissive: potionColor,
		emissiveIntensity: 0.5,
		transparent: true,
		opacity: 0.8
	});
	
	const potionMesh = new Mesh(potionGeometry, potionMaterial);
	
	// Position the potion above the cell and make it float
	const cellX = (cell.x - (gameState.board[0].length - 1) / 2) * Constants.CELL_SIZE;
	const cellZ = (cell.y - (gameState.board.length - 1) / 2) * Constants.CELL_SIZE;
	
	potionMesh.position.set(cellX, Constants.CELL_SIZE * 0.5, cellZ);
	potionMesh.castShadow = true;
	
	// Store initial position for animation
	potionMesh.userData.originalY = potionMesh.position.y;
	potionMesh.userData.potionType = cell.potion.type;
	
	// Add to board group
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
			pieceGeometry = new CylinderGeometry(0.3, 0.4, 0.8, 8);
			break;
		case Constants.CHESS_PIECE_TYPES.ROOK:
			pieceGeometry = new BoxGeometry(0.6, 1, 0.6);
			break;
		case Constants.CHESS_PIECE_TYPES.KNIGHT:
			// Create a more complex knight shape
			const knightGroup = new Group();
			const baseGeometry = new CylinderGeometry(0.4, 0.5, 0.6, 8);
			const base = new Mesh(baseGeometry, new MeshStandardMaterial({ color: player.color }));
			base.position.y = 0.3;
			knightGroup.add(base);
			
			const headGeometry = new BoxGeometry(0.3, 0.5, 0.7);
			const head = new Mesh(headGeometry, new MeshStandardMaterial({ color: player.color }));
			head.position.set(0, 0.8, 0.1);
			head.rotation.x = Math.PI / 6;
			knightGroup.add(head);
			
			pieceGeometry = knightGroup;
			break;
		case Constants.CHESS_PIECE_TYPES.BISHOP:
			pieceGeometry = new ConeGeometry(0.4, 1.2, 8);
			break;
		case Constants.CHESS_PIECE_TYPES.QUEEN:
			pieceGeometry = new CylinderGeometry(0.3, 0.5, 1.3, 8);
			break;
		case Constants.CHESS_PIECE_TYPES.KING:
			// Create a more complex king shape
			const kingGroup = new Group();
			const kingBaseGeometry = new CylinderGeometry(0.4, 0.5, 1, 8);
			const kingBase = new Mesh(kingBaseGeometry, new MeshStandardMaterial({ color: player.color }));
			kingBase.position.y = 0.5;
			kingGroup.add(kingBase);
			
			const crownGeometry = new BoxGeometry(0.8, 0.3, 0.8);
			const crown = new Mesh(crownGeometry, new MeshStandardMaterial({ color: player.color }));
			crown.position.y = 1.15;
			kingGroup.add(crown);
			
			const crossGeometry = new BoxGeometry(0.2, 0.4, 0.2);
			const cross = new Mesh(crossGeometry, new MeshStandardMaterial({ color: player.color }));
			cross.position.y = 1.5;
			kingGroup.add(cross);
			
			pieceGeometry = kingGroup;
			break;
		default:
			// Default to pawn
			pieceGeometry = new BoxGeometry(0.5, 0.5, 0.5);
			break;
	}
	
	// Check if we need a simple or complex mesh
	let pieceMesh;
	if (pieceGeometry instanceof Group) {
		pieceMesh = pieceGeometry;
	} else {
		const pieceMaterial = new MeshStandardMaterial({
			color: player.color,
			roughness: 0.6,
			metalness: 0.3
		});
		pieceMesh = new Mesh(pieceGeometry, pieceMaterial);
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
	const tetrominoGroup3D = new Group();
	
	// Add blocks to the tetromino
	fallingPiece.blocks.forEach(block => {
		const blockGeometry = new BoxGeometry(
			Constants.CELL_SIZE * 0.9,
			Constants.CELL_SIZE * 0.9,
			Constants.CELL_SIZE * 0.9
		);
		
		const blockMaterial = materials[`tetromino_${fallingPiece.type}`] || 
			new MeshStandardMaterial({
				color: Constants.TETROMINO_COLORS[fallingPiece.type] || 0xCCCCCC,
				roughness: 0.7,
				metalness: 0.3
			});
		
		const blockMesh = new Mesh(blockGeometry, blockMaterial);
		
		// Position the block
		const x = (fallingPiece.x + block.x - (gameState.board[0].length - 1) / 2) * Constants.CELL_SIZE;
		const y = Constants.CELL_SIZE * 0.45; // Slight elevation above board
		const z = (fallingPiece.y + block.y - (gameState.board.length - 1) / 2) * Constants.CELL_SIZE;
		
		blockMesh.position.set(x, y, z);
		blockMesh.castShadow = true;
		
		tetrominoGroup3D.add(blockMesh);
	});
	
	// Add the chess piece to the first block if it's a falling chess piece
	if (fallingPiece.chessPiece) {
		const firstBlock = fallingPiece.blocks[0];
		const x = (fallingPiece.x + firstBlock.x - (gameState.board[0].length - 1) / 2) * Constants.CELL_SIZE;
		const y = Constants.CELL_SIZE * 0.9; // Place on top of the block
		const z = (fallingPiece.y + firstBlock.y - (gameState.board.length - 1) / 2) * Constants.CELL_SIZE;
		
		const pieceScale = 0.8;
		const piece = addChessPiece(fallingPiece.chessPiece, materials.chessPieceWhite);
		piece.position.set(x, y, z);
		piece.scale.set(pieceScale, pieceScale, pieceScale);
		
		tetrominoGroup3D.add(piece);
	}
	
	// Add the tetromino to the scene
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
	const ghostGroup = new Group();
	
	// Add blocks to the ghost piece
	ghostPiece.blocks.forEach(block => {
		const blockGeometry = new BoxGeometry(
			Constants.CELL_SIZE * 0.8,
			Constants.CELL_SIZE * 0.8,
			Constants.CELL_SIZE * 0.8
		);
		
		const blockMaterial = new MeshStandardMaterial({
			color: Constants.TETROMINO_COLORS[ghostPiece.type] || 0xCCCCCC,
			roughness: 0.7,
			metalness: 0.3,
			transparent: true,
			opacity: 0.3
		});
		
		const blockMesh = new Mesh(blockGeometry, blockMaterial);
		
		// Position the block
		const gameState = GameState.getGameState();
		const x = (ghostPiece.x + block.x - (gameState.board[0].length - 1) / 2) * Constants.CELL_SIZE;
		const y = Constants.CELL_SIZE * 0.4; // At board level
		const z = (ghostPiece.y + block.y - (gameState.board.length - 1) / 2) * Constants.CELL_SIZE;
		
		blockMesh.position.set(x, y, z);
		
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