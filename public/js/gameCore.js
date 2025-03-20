/**
 * Shaktris Core Game Implementation
 * 
 * Handles core gameplay mechanics for Shaktris.
 * Focuses on a functional implementation with minimal dependencies.
 */

// Core game state
let gameState = {
	board: [],
	chessPieces: [],
	currentTetromino: null,
	ghostPiece: null,
	players: [],
	currentPlayer: 1,
	turnPhase: 'tetris', // 'tetris' or 'chess'
	isGameOver: false,
	winner: null
};

// Cached DOM elements
let containerElement;
let scene, camera, renderer, controls;
let boardGroup;

// Constants
const BOARD_SIZE = 16;
const CELL_SIZE = 1;
const PLAYER_COLORS = {
	1: 0x3333ff, // Blue
	2: 0xff8800  // Orange
};

/**
 * Initialize the game
 * @param {HTMLElement} container - Game container element
 */
export function initGame(container) {
	console.log('Initializing Shaktris core game...');
	
	// Check if THREE is available
	if (typeof THREE === 'undefined') {
		console.error('THREE.js is not loaded! Make sure it is included before gameCore.js');
		return false;
	}
	
	containerElement = container;
	
	try {
		// Set up game state
		resetGameState();
		
		// Set up 3D scene
		setupScene();
		
		// Create board
		createBoard();
		
		// Set up chess pieces
		setupChessPieces();
		
		// Initialize tetromino system
		initTetrominoSystem();
		
		// Set up input handlers
		setupInputHandlers();
		
		// Start game loop
		startGameLoop();
		
		console.log('Core game initialized');
		return true;
	} catch (error) {
		console.error('Error initializing game:', error);
		return false;
	}
}

/**
 * Reset game state to initial values
 */
function resetGameState() {
	console.log('Resetting game state...');
	// Create empty board
	gameState.board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
	
	// Set up home zones
	setupHomeZones();
	
	// Reset pieces and turn info
	gameState.chessPieces = [];
	gameState.players = [
		{ id: 1, name: 'Player 1', score: 0 },
		{ id: 2, name: 'Computer', score: 0 }
	];
	gameState.currentPlayer = 1;
	gameState.turnPhase = 'tetris';
	gameState.isGameOver = false;
	gameState.winner = null;
}

/**
 * Set up home zones on the board
 */
function setupHomeZones() {
	// Player 1 (blue) - bottom
	for (let z = BOARD_SIZE - 2; z < BOARD_SIZE; z++) {
		for (let x = 0; x < 8; x++) {
			gameState.board[z][x] = 6; // Blue 
		}
	}
	
	// Player 2 (orange) - top
	for (let z = 0; z < 2; z++) {
		for (let x = 8; x < BOARD_SIZE; x++) {
			gameState.board[z][x] = 7; // Orange
		}
	}
}

/**
 * Set up the 3D scene
 */
function setupScene() {
	console.log('Setting up 3D scene...');
	try {
		// Create scene
		scene = new THREE.Scene();
		scene.background = new THREE.Color(0x87CEEB); // Light blue sky
		
		// Create camera
		const width = containerElement.clientWidth;
		const height = containerElement.clientHeight;
		camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
		camera.position.set(20, 25, 20);
		
		// Create renderer
		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(width, height);
		renderer.shadowMap.enabled = true;
		containerElement.appendChild(renderer.domElement);
		
		// Check if OrbitControls is available
		if (typeof THREE.OrbitControls === 'undefined') {
			console.warn('THREE.OrbitControls is not available. Basic camera will be used.');
		} else {
			// Create orbit controls
			controls = new THREE.OrbitControls(camera, renderer.domElement);
			controls.enableDamping = true;
			controls.dampingFactor = 0.15;
			controls.screenSpacePanning = true;
			controls.minDistance = 10;
			controls.maxDistance = 60;
			controls.target.set(8, 0, 8);
			controls.update();
		}
		
		// Add lights
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
		scene.add(ambientLight);
		
		const sunLight = new THREE.DirectionalLight(0xffffee, 1.0);
		sunLight.position.set(30, 50, 30);
		sunLight.castShadow = true;
		sunLight.shadow.mapSize.width = 2048;
		sunLight.shadow.mapSize.height = 2048;
		scene.add(sunLight);
		
		// Create board group
		boardGroup = new THREE.Group();
		scene.add(boardGroup);
		
		// Add resize listener
		window.addEventListener('resize', onWindowResize);
		
		console.log('Scene setup complete');
	} catch (error) {
		console.error('Error setting up scene:', error);
		throw error;
	}
}

/**
 * Handle window resize
 */
function onWindowResize() {
	if (!camera || !renderer || !containerElement) return;
	
	const width = containerElement.clientWidth;
	const height = containerElement.clientHeight;
	camera.aspect = width / height;
	camera.updateProjectionMatrix();
	renderer.setSize(width, height);
}

/**
 * Create the game board visualization
 */
function createBoard() {
	console.log('Creating game board...');
	try {
		// Create cell container
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
		}
		
		// Offset for centering board
		const offsetX = BOARD_SIZE / 2 - 0.5;
		const offsetZ = BOARD_SIZE / 2 - 0.5;
		
		// Create cells for each board position
		for (let z = 0; z < BOARD_SIZE; z++) {
			for (let x = 0; x < BOARD_SIZE; x++) {
				const cellValue = gameState.board[z][x];
				
				// Skip empty cells
				if (!cellValue) continue;
				
				// Create cell group
				const cellGroup = new THREE.Group();
				cellGroup.userData = { boardX: x, boardZ: z, value: cellValue };
				
				// Create cell mesh
				const geometry = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);
				const color = getCellColor(cellValue);
				const material = new THREE.MeshStandardMaterial({ 
					color: color,
					roughness: 0.7,
					metalness: 0.2
				});
				
				const cell = new THREE.Mesh(geometry, material);
				cell.castShadow = true;
				cell.receiveShadow = true;
				cellGroup.add(cell);
				
				// Add bottom extension
				const bottomGeometry = new THREE.BoxGeometry(0.8, 0.3, 0.8);
				const bottomMaterial = new THREE.MeshStandardMaterial({
					color: darkenColor(color, 0.7),
					roughness: 0.9,
					metalness: 0.1
				});
				
				const bottomExtension = new THREE.Mesh(bottomGeometry, bottomMaterial);
				bottomExtension.position.y = -0.65;
				bottomExtension.castShadow = true;
				cellGroup.add(bottomExtension);
				
				// Position cell group
				cellGroup.position.set(
					x - offsetX,
					0.5, // Half-height above origin
					z - offsetZ
				);
				
				// Add cell to container
				cellsContainer.add(cellGroup);
			}
		}
		
		console.log(`Created board with ${cellsContainer.children.length} cells`);
	} catch (error) {
		console.error('Error creating board:', error);
		throw error;
	}
}

/**
 * Set up chess pieces
 */
function setupChessPieces() {
	console.log('Setting up chess pieces...');
	try {
		// Clear existing pieces
		gameState.chessPieces = [];
		
		// Create chess pieces for Player 1 (bottom)
		const player1Pieces = [
			// Pawns
			{ id: 'p1-pawn-0', type: 'pawn', player: 1, x: 0, z: 14 },
			{ id: 'p1-pawn-1', type: 'pawn', player: 1, x: 1, z: 14 },
			{ id: 'p1-pawn-2', type: 'pawn', player: 1, x: 2, z: 14 },
			{ id: 'p1-pawn-3', type: 'pawn', player: 1, x: 3, z: 14 },
			{ id: 'p1-pawn-4', type: 'pawn', player: 1, x: 4, z: 14 },
			{ id: 'p1-pawn-5', type: 'pawn', player: 1, x: 5, z: 14 },
			{ id: 'p1-pawn-6', type: 'pawn', player: 1, x: 6, z: 14 },
			{ id: 'p1-pawn-7', type: 'pawn', player: 1, x: 7, z: 14 },
			
			// Back row
			{ id: 'p1-rook-0', type: 'rook', player: 1, x: 0, z: 15 },
			{ id: 'p1-knight-0', type: 'knight', player: 1, x: 1, z: 15 },
			{ id: 'p1-bishop-0', type: 'bishop', player: 1, x: 2, z: 15 },
			{ id: 'p1-queen-0', type: 'queen', player: 1, x: 3, z: 15 },
			{ id: 'p1-king-0', type: 'king', player: 1, x: 4, z: 15 },
			{ id: 'p1-bishop-1', type: 'bishop', player: 1, x: 5, z: 15 },
			{ id: 'p1-knight-1', type: 'knight', player: 1, x: 6, z: 15 },
			{ id: 'p1-rook-1', type: 'rook', player: 1, x: 7, z: 15 }
		];
		
		// Create chess pieces for Player 2 (top)
		const player2Pieces = [
			// Pawns
			{ id: 'p2-pawn-0', type: 'pawn', player: 2, x: 8, z: 1 },
			{ id: 'p2-pawn-1', type: 'pawn', player: 2, x: 9, z: 1 },
			{ id: 'p2-pawn-2', type: 'pawn', player: 2, x: 10, z: 1 },
			{ id: 'p2-pawn-3', type: 'pawn', player: 2, x: 11, z: 1 },
			{ id: 'p2-pawn-4', type: 'pawn', player: 2, x: 12, z: 1 },
			{ id: 'p2-pawn-5', type: 'pawn', player: 2, x: 13, z: 1 },
			{ id: 'p2-pawn-6', type: 'pawn', player: 2, x: 14, z: 1 },
			{ id: 'p2-pawn-7', type: 'pawn', player: 2, x: 15, z: 1 },
			
			// Back row
			{ id: 'p2-rook-0', type: 'rook', player: 2, x: 8, z: 0 },
			{ id: 'p2-knight-0', type: 'knight', player: 2, x: 9, z: 0 },
			{ id: 'p2-bishop-0', type: 'bishop', player: 2, x: 10, z: 0 },
			{ id: 'p2-queen-0', type: 'queen', player: 2, x: 11, z: 0 },
			{ id: 'p2-king-0', type: 'king', player: 2, x: 12, z: 0 },
			{ id: 'p2-bishop-1', type: 'bishop', player: 2, x: 13, z: 0 },
			{ id: 'p2-knight-1', type: 'knight', player: 2, x: 14, z: 0 },
			{ id: 'p2-rook-1', type: 'rook', player: 2, x: 15, z: 0 }
		];
		
		// Add all pieces to game state
		gameState.chessPieces = [...player1Pieces, ...player2Pieces];
		
		// Create 3D representations
		updateChessPieces();
		
		console.log('Chess pieces setup complete');
	} catch (error) {
		console.error('Error setting up chess pieces:', error);
		throw error;
	}
}

/**
 * Update chess pieces visualization
 */
function updateChessPieces() {
	try {
		// Get piece container or create if it doesn't exist
		let piecesContainer = boardGroup.getObjectByName('pieces');
		if (!piecesContainer) {
			piecesContainer = new THREE.Group();
			piecesContainer.name = 'pieces';
			boardGroup.add(piecesContainer);
		}
		
		// Clear existing pieces
		while (piecesContainer.children.length > 0) {
			const child = piecesContainer.children[0];
			piecesContainer.remove(child);
		}
		
		// Create 3D meshes for pieces
		gameState.chessPieces.forEach(piece => {
			const pieceObj = createChessPiece(piece);
			piecesContainer.add(pieceObj);
		});
	} catch (error) {
		console.error('Error updating chess pieces:', error);
		throw error;
	}
}

/**
 * Create a chess piece 3D object
 * @param {Object} piece - Chess piece data
 * @returns {THREE.Group} - 3D representation of chess piece
 */
function createChessPiece(piece) {
	// Create piece group
	const pieceGroup = new THREE.Group();
	pieceGroup.name = piece.id;
	pieceGroup.userData = { 
		id: piece.id,
		type: piece.type,
		player: piece.player,
		x: piece.x,
		z: piece.z
	};
	
	// Get player color
	const playerColor = PLAYER_COLORS[piece.player] || 0xcccccc;
	
	// Create piece mesh based on type
	let geometry, height;
	
	switch (piece.type) {
		case 'pawn':
			geometry = new THREE.ConeGeometry(0.3, 0.6, 8);
			height = 0.8;
			break;
			
		case 'rook':
			geometry = new THREE.BoxGeometry(0.4, 0.7, 0.4);
			height = 0.8;
			break;
			
		case 'knight':
			geometry = new THREE.BoxGeometry(0.4, 0.7, 0.4);
			height = 0.8;
			break;
			
		case 'bishop':
			geometry = new THREE.ConeGeometry(0.3, 0.8, 8);
			height = 0.9;
			break;
			
		case 'queen':
			geometry = new THREE.CylinderGeometry(0.2, 0.4, 0.9, 8);
			height = 1.0;
			break;
			
		case 'king':
			geometry = new THREE.CylinderGeometry(0.2, 0.4, 1.0, 8);
			height = 1.1;
			break;
			
		default:
			geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
			height = 0.6;
	}
	
	// Create mesh with player color
	const material = new THREE.MeshStandardMaterial({ 
		color: playerColor,
		roughness: 0.5,
		metalness: 0.3
	});
	
	const mesh = new THREE.Mesh(geometry, material);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.position.y = height / 2;
	pieceGroup.add(mesh);
	
	// Calculate position
	const offsetX = BOARD_SIZE / 2 - 0.5;
	const offsetZ = BOARD_SIZE / 2 - 0.5;
	
	pieceGroup.position.set(
		piece.x - offsetX,
		1.0, // Position on top of cell
		piece.z - offsetZ
	);
	
	return pieceGroup;
}

/**
 * Initialize tetromino system
 */
function initTetrominoSystem() {
	console.log('Initializing tetromino system...');
	try {
		// Create initial tetromino if needed
		if (!gameState.currentTetromino) {
			gameState.currentTetromino = createRandomTetromino();
			gameState.ghostPiece = calculateGhostPiece();
		}
		
		updateTetrominoVisuals();
		
		console.log('Tetromino system initialized');
	} catch (error) {
		console.error('Error initializing tetromino system:', error);
		throw error;
	}
}

/**
 * Create a random tetromino
 * @returns {Object} Tetromino data
 */
function createRandomTetromino() {
	const tetrominoTypes = ['I', 'O', 'T', 'J', 'L', 'S', 'Z'];
	const randomType = tetrominoTypes[Math.floor(Math.random() * tetrominoTypes.length)];
	
	return {
		type: randomType,
		position: { x: 8, y: 10, z: 8 }, // Start in middle, above board
		rotation: 0,
		shape: getTetrominoShape(randomType)
	};
}

/**
 * Get tetromino shape based on type
 * @param {string} type - Tetromino type
 * @returns {Array} 2D array representing tetromino shape
 */
function getTetrominoShape(type) {
	switch (type) {
		case 'I': return [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]];
		case 'O': return [[1, 1], [1, 1]];
		case 'T': return [[0, 1, 0], [1, 1, 1], [0, 0, 0]];
		case 'J': return [[1, 0, 0], [1, 1, 1], [0, 0, 0]];
		case 'L': return [[0, 0, 1], [1, 1, 1], [0, 0, 0]];
		case 'S': return [[0, 1, 1], [1, 1, 0], [0, 0, 0]];
		case 'Z': return [[1, 1, 0], [0, 1, 1], [0, 0, 0]];
		default: return [[1, 1], [1, 1]]; // Default to O
	}
}

/**
 * Calculate ghost piece position
 * @returns {Object} Ghost piece data
 */
function calculateGhostPiece() {
	if (!gameState.currentTetromino) return null;
	
	// Clone current tetromino
	const ghost = {
		...gameState.currentTetromino,
		position: { ...gameState.currentTetromino.position }
	};
	
	// Drop it down until it collides
	while (!checkTetrominoCollision(ghost, 0, -1, 0)) {
		ghost.position.y--;
	}
	
	return ghost;
}

/**
 * Update tetromino visuals
 */
function updateTetrominoVisuals() {
	try {
		// Get tetromino container
		let tetrominoContainer = boardGroup.getObjectByName('tetrominos');
		if (!tetrominoContainer) {
			tetrominoContainer = new THREE.Group();
			tetrominoContainer.name = 'tetrominos';
			boardGroup.add(tetrominoContainer);
		}
		
		// Clear existing tetrominos
		while (tetrominoContainer.children.length > 0) {
			const child = tetrominoContainer.children[0];
			tetrominoContainer.remove(child);
		}
		
		// Add current tetromino
		if (gameState.currentTetromino) {
			const tetromino = createTetrominoMesh(gameState.currentTetromino, false);
			tetrominoContainer.add(tetromino);
		}
		
		// Add ghost piece
		if (gameState.ghostPiece) {
			const ghost = createTetrominoMesh(gameState.ghostPiece, true);
			tetrominoContainer.add(ghost);
		}
	} catch (error) {
		console.error('Error updating tetromino visuals:', error);
		throw error;
	}
}

/**
 * Create tetromino 3D mesh
 * @param {Object} tetromino - Tetromino data
 * @param {boolean} isGhost - Whether this is a ghost piece
 * @returns {THREE.Group} - 3D representation of tetromino
 */
function createTetrominoMesh(tetromino, isGhost = false) {
	const group = new THREE.Group();
	group.name = isGhost ? 'ghostPiece' : 'currentTetromino';
	
	// Get color based on tetromino type
	let color;
	switch (tetromino.type) {
		case 'I': color = 0x00ffff; break;
		case 'O': color = 0xffff00; break;
		case 'T': color = 0xaa00ff; break;
		case 'J': color = 0x0000ff; break;
		case 'L': color = 0xff8800; break;
		case 'S': color = 0x00ff00; break;
		case 'Z': color = 0xff0000; break;
		default: color = 0xcccccc;
	}
	
	// If ghost piece, make it semi-transparent
	const material = new THREE.MeshStandardMaterial({
		color: color,
		transparent: isGhost,
		opacity: isGhost ? 0.3 : 1.0,
		roughness: 0.7,
		metalness: 0.2
	});
	
	// Create blocks for each cell in the tetromino shape
	const shape = tetromino.shape;
	const offsetX = BOARD_SIZE / 2 - 0.5;
	const offsetZ = BOARD_SIZE / 2 - 0.5;
	
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x]) {
				const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);
				const block = new THREE.Mesh(geometry, material);
				
				block.position.set(
					x + tetromino.position.x - offsetX - shape[z].length / 2 + 0.5,
					tetromino.position.y,
					z + tetromino.position.z - offsetZ - shape.length / 2 + 0.5
				);
				
				block.castShadow = !isGhost;
				group.add(block);
			}
		}
	}
	
	return group;
}

/**
 * Check if tetromino collides with board or boundaries
 * @param {Object} tetromino - Tetromino to check
 * @param {number} offsetX - X offset to check
 * @param {number} offsetY - Y offset to check
 * @param {number} offsetZ - Z offset to check
 * @returns {boolean} True if collision occurs
 */
function checkTetrominoCollision(tetromino, offsetX = 0, offsetY = 0, offsetZ = 0) {
	const shape = tetromino.shape;
	const posX = tetromino.position.x + offsetX;
	const posY = tetromino.position.y + offsetY;
	const posZ = tetromino.position.z + offsetZ;
	
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x]) {
				const boardX = Math.floor(posX + x - shape[z].length / 2 + 0.5);
				const boardZ = Math.floor(posZ + z - shape.length / 2 + 0.5);
				
				// Check boundaries
				if (boardX < 0 || boardX >= BOARD_SIZE || boardZ < 0 || boardZ >= BOARD_SIZE) {
					return true;
				}
				
				// Check board cells (if at y=0)
				if (posY <= 0) {
					// If at board level, check for existing cells
					if (gameState.board[boardZ][boardX] !== 0) {
						return true;
					}
				}
			}
		}
	}
	
	return false;
}

/**
 * Place current tetromino on the board
 */
function placeCurrentTetromino() {
	const tetromino = gameState.currentTetromino;
	if (!tetromino) return;
	
	const shape = tetromino.shape;
	const posX = tetromino.position.x;
	const posY = tetromino.position.y;
	const posZ = tetromino.position.z;
	
	// Only place if at y=0
	if (posY <= 0) {
		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (shape[z][x]) {
					const boardX = Math.floor(posX + x - shape[z].length / 2 + 0.5);
					const boardZ = Math.floor(posZ + z - shape.length / 2 + 0.5);
					
					// Make sure we're on the board
					if (boardX >= 0 && boardX < BOARD_SIZE && boardZ >= 0 && boardZ < BOARD_SIZE) {
						// Place tetromino block (use value 1-5 based on type)
						let cellValue;
						switch (tetromino.type) {
							case 'I': cellValue = 1; break;
							case 'O': cellValue = 2; break;
							case 'T': cellValue = 3; break;
							case 'J': case 'L': cellValue = 4; break;
							case 'S': case 'Z': cellValue = 5; break;
							default: cellValue = 1;
						}
						
						gameState.board[boardZ][boardX] = cellValue;
					}
				}
			}
		}
		
		// Move to chess phase
		gameState.turnPhase = 'chess';
		
		// Update visuals
		createBoard();
		
		// Create a new tetromino for next turn
		gameState.currentTetromino = createRandomTetromino();
		gameState.ghostPiece = calculateGhostPiece();
		updateTetrominoVisuals();
	}
}

/**
 * Move current tetromino
 * @param {number} dx - X direction
 * @param {number} dy - Y direction
 * @param {number} dz - Z direction
 * @returns {boolean} Whether the move was successful
 */
function moveCurrentTetromino(dx, dy, dz) {
	const tetromino = gameState.currentTetromino;
	if (!tetromino) return false;
	
	// Check for collision
	if (checkTetrominoCollision(tetromino, dx, dy, dz)) {
		// If moving down and collision, place the tetromino
		if (dy < 0) {
			placeCurrentTetromino();
		}
		return false;
	}
	
	// Move tetromino
	tetromino.position.x += dx;
	tetromino.position.y += dy;
	tetromino.position.z += dz;
	
	// Update ghost piece
	gameState.ghostPiece = calculateGhostPiece();
	
	// Update visuals
	updateTetrominoVisuals();
	
	return true;
}

/**
 * Rotate current tetromino
 * @param {number} direction - 1 for clockwise, -1 for counter-clockwise
 * @returns {boolean} Whether the rotation was successful
 */
function rotateCurrentTetromino(direction) {
	const tetromino = gameState.currentTetromino;
	if (!tetromino) return false;
	
	// Save original shape
	const originalShape = tetromino.shape;
	
	// Create new rotated shape
	const size = tetromino.shape.length;
	const newShape = Array(size).fill().map(() => Array(size).fill(0));
	
	if (direction > 0) {
		// Clockwise rotation
		for (let z = 0; z < size; z++) {
			for (let x = 0; x < size; x++) {
				newShape[x][size - 1 - z] = originalShape[z][x];
			}
		}
	} else {
		// Counter-clockwise rotation
		for (let z = 0; z < size; z++) {
			for (let x = 0; x < size; x++) {
				newShape[size - 1 - x][z] = originalShape[z][x];
			}
		}
	}
	
	// Apply rotation
	tetromino.shape = newShape;
	
	// Check for collision
	if (checkTetrominoCollision(tetromino)) {
		// If collision, revert to original shape
		tetromino.shape = originalShape;
		return false;
	}
	
	// Update ghost piece
	gameState.ghostPiece = calculateGhostPiece();
	
	// Update visuals
	updateTetrominoVisuals();
	
	return true;
}

/**
 * Hard drop current tetromino
 */
function hardDropTetromino() {
	const tetromino = gameState.currentTetromino;
	if (!tetromino) return;
	
	// Move down until collision
	while (!checkTetrominoCollision(tetromino, 0, -1, 0)) {
		tetromino.position.y--;
	}
	
	// Place the tetromino
	placeCurrentTetromino();
}

/**
 * Set up input handlers
 */
function setupInputHandlers() {
	console.log('Setting up input handlers...');
	try {
		// Keyboard controls
		document.addEventListener('keydown', onKeyDown);
		
		// Initialize raycaster for mouse interaction
		raycaster = new THREE.Raycaster();
		mouse = new THREE.Vector2();
		
		// Mouse controls
		if (renderer && renderer.domElement) {
			renderer.domElement.addEventListener('mousedown', onMouseDown);
			renderer.domElement.addEventListener('mousemove', onMouseMove);
			renderer.domElement.addEventListener('mouseup', onMouseUp);
		}
		
		console.log('Input handlers setup complete');
	} catch (error) {
		console.error('Error setting up input handlers:', error);
		throw error;
	}
}

/**
 * Handle key down events
 * @param {KeyboardEvent} event - Key event
 */
function onKeyDown(event) {
	// Only handle tetromino controls during tetris phase
	if (gameState.turnPhase === 'tetris') {
		switch (event.key) {
			case 'ArrowLeft':
				moveCurrentTetromino(-1, 0, 0);
				event.preventDefault();
				break;
				
			case 'ArrowRight':
				moveCurrentTetromino(1, 0, 0);
				event.preventDefault();
				break;
				
			case 'ArrowUp':
				rotateCurrentTetromino(1);
				event.preventDefault();
				break;
				
			case 'ArrowDown':
				moveCurrentTetromino(0, -1, 0);
				event.preventDefault();
				break;
				
			case 'w':
				moveCurrentTetromino(0, 0, -1);
				event.preventDefault();
				break;
				
			case 's':
				moveCurrentTetromino(0, 0, 1);
				event.preventDefault();
				break;
				
			case 'z':
				rotateCurrentTetromino(-1);
				event.preventDefault();
				break;
				
			case 'x':
				rotateCurrentTetromino(1);
				event.preventDefault();
				break;
				
			case ' ': // Space
				hardDropTetromino();
				event.preventDefault();
				break;
		}
	}
}

// Mouse interaction variables
let selectedPiece = null;
let validMoves = [];
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();

/**
 * Handle mouse down events
 * @param {MouseEvent} event - Mouse event
 */
function onMouseDown(event) {
	// Only handle chess piece selection during chess phase
	if (gameState.turnPhase !== 'chess') return;
	
	// Calculate mouse position
	updateMousePosition(event);
	
	// Cast ray
	raycaster.setFromCamera(mouse, camera);
	
	// Check for intersection with chess pieces
	const piecesContainer = boardGroup.getObjectByName('pieces');
	if (piecesContainer) {
		const intersects = raycaster.intersectObjects(piecesContainer.children, true);
		
		if (intersects.length > 0) {
			// Find the chess piece group
			let pieceObject = intersects[0].object;
			while (pieceObject.parent && pieceObject.parent !== piecesContainer) {
				pieceObject = pieceObject.parent;
			}
			
			// Get piece data
			const pieceData = pieceObject.userData;
			const piece = gameState.chessPieces.find(p => p.id === pieceData.id);
			
			if (piece && piece.player === gameState.currentPlayer) {
				// Select piece
				selectedPiece = piece;
				
				// Get valid moves
				validMoves = getValidMoves(piece);
				
				// Highlight valid moves
				highlightValidMoves(validMoves);
			}
		}
	}
}

/**
 * Handle mouse move events
 * @param {MouseEvent} event - Mouse event
 */
function onMouseMove(event) {
	updateMousePosition(event);
}

/**
 * Handle mouse up events
 * @param {MouseEvent} event - Mouse event
 */
function onMouseUp(event) {
	// Only handle chess piece movement during chess phase
	if (gameState.turnPhase !== 'chess' || !selectedPiece) return;
	
	// Calculate mouse position
	updateMousePosition(event);
	
	// Cast ray
	raycaster.setFromCamera(mouse, camera);
	
	// Check for intersection with board cells
	const cellsContainer = boardGroup.getObjectByName('cells');
	if (cellsContainer) {
		const intersects = raycaster.intersectObjects(cellsContainer.children, true);
		
		if (intersects.length > 0) {
			// Find the cell group
			let cellObject = intersects[0].object;
			while (cellObject.parent && cellObject.parent !== cellsContainer) {
				cellObject = cellObject.parent;
			}
			
			// Get cell data
			const cellData = cellObject.userData;
			const targetX = cellData.boardX;
			const targetZ = cellData.boardZ;
			
			// Check if this is a valid move
			if (validMoves.some(move => move.x === targetX && move.z === targetZ)) {
				// Move the piece
				movePiece(selectedPiece, targetX, targetZ);
				
				// End chess phase
				gameState.turnPhase = 'tetris';
				
				// Switch players
				gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
			}
		}
	}
	
	// Clear selection
	selectedPiece = null;
	validMoves = [];
	clearHighlights();
}

/**
 * Update mouse position in normalized device coordinates
 * @param {MouseEvent} event - Mouse event
 */
function updateMousePosition(event) {
	const rect = renderer.domElement.getBoundingClientRect();
	mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

/**
 * Get valid moves for a chess piece
 * @param {Object} piece - Chess piece
 * @returns {Array} Array of valid move coordinates
 */
function getValidMoves(piece) {
	// TEMPORARY SIMPLE IMPLEMENTATION
	// In a real implementation, this would check piece type and board state
	const moves = [];
	
	// For now, allow movement to adjacent cells
	const directions = [
		{ dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
		{ dx: 1, dz: 1 }, { dx: -1, dz: 1 }, { dx: 1, dz: -1 }, { dx: -1, dz: -1 }
	];
	
	for (const dir of directions) {
		const x = piece.x + dir.dx;
		const z = piece.z + dir.dz;
		
		// Check if in bounds
		if (x >= 0 && x < BOARD_SIZE && z >= 0 && z < BOARD_SIZE) {
			// Check if cell exists and is not occupied by own piece
			if (gameState.board[z][x] !== 0) {
				const occupyingPiece = gameState.chessPieces.find(p => p.x === x && p.z === z);
				if (!occupyingPiece || occupyingPiece.player !== piece.player) {
					moves.push({ x, z });
				}
			}
		}
	}
	
	return moves;
}

/**
 * Highlight valid moves
 * @param {Array} moves - Array of valid move coordinates
 */
function highlightValidMoves(moves) {
	// Get highlight container
	let highlightContainer = boardGroup.getObjectByName('highlights');
	if (!highlightContainer) {
		highlightContainer = new THREE.Group();
		highlightContainer.name = 'highlights';
		boardGroup.add(highlightContainer);
	}
	
	// Clear existing highlights
	clearHighlights(highlightContainer);
	
	// Create highlights for valid moves
	const offsetX = BOARD_SIZE / 2 - 0.5;
	const offsetZ = BOARD_SIZE / 2 - 0.5;
	
	for (const move of moves) {
		// Create highlight mesh
		const geometry = new THREE.CircleGeometry(0.4, 16);
		const material = new THREE.MeshBasicMaterial({
			color: 0x00ff00,
			transparent: true,
			opacity: 0.5,
			side: THREE.DoubleSide
		});
		
		const highlight = new THREE.Mesh(geometry, material);
		highlight.rotation.x = -Math.PI / 2;
		highlight.position.set(
			move.x - offsetX,
			1.01, // Just above cell
			move.z - offsetZ
		);
		
		highlightContainer.add(highlight);
	}
}

/**
 * Clear move highlights
 */
function clearHighlights() {
	const highlightContainer = boardGroup.getObjectByName('highlights');
	if (highlightContainer) {
		while (highlightContainer.children.length > 0) {
			const child = highlightContainer.children[0];
			highlightContainer.remove(child);
			if (child.geometry) child.geometry.dispose();
			if (child.material) child.material.dispose();
		}
	}
}

/**
 * Move a chess piece
 * @param {Object} piece - Chess piece to move
 * @param {number} x - Destination X coordinate
 * @param {number} z - Destination Z coordinate
 */
function movePiece(piece, x, z) {
	// Check for captured piece
	const capturedPieceIndex = gameState.chessPieces.findIndex(p => 
		p.x === x && p.z === z && p.player !== piece.player
	);
	
	if (capturedPieceIndex >= 0) {
		// Remove captured piece
		const capturedPiece = gameState.chessPieces[capturedPieceIndex];
		gameState.chessPieces.splice(capturedPieceIndex, 1);
		
		// Check if king was captured
		if (capturedPiece.type === 'king') {
			gameState.isGameOver = true;
			gameState.winner = piece.player;
		}
	}
	
	// Update piece position
	piece.x = x;
	piece.z = z;
	
	// Update visuals
	updateChessPieces();
}

/**
 * Start game loop
 */
function startGameLoop() {
	console.log('Starting game loop...');
	
	// Animation frame callback
	const update = () => {
		try {
			// Update controls if available
			if (controls) {
				controls.update();
			}
			
			// Render scene
			if (renderer && scene && camera) {
				renderer.render(scene, camera);
			}
			
			// Request next frame
			requestAnimationFrame(update);
		} catch (error) {
			console.error('Error in game loop:', error);
		}
	};
	
	// Start loop
	update();
	console.log('Game loop started');
}

/**
 * Get color for a cell based on value
 * @param {number} value - Cell value
 * @returns {number} - Color as hex
 */
function getCellColor(value) {
	switch (value) {
		case 1: return 0x00ffff; // Cyan (I)
		case 2: return 0xffff00; // Yellow (O)
		case 3: return 0xaa00ff; // Purple (T)
		case 4: return 0x0000ff; // Blue (J/L)
		case 5: return 0x00ff00; // Green (S/Z)
		case 6: return 0x3333ff; // Player 1 home
		case 7: return 0xff8800; // Player 2 home
		default: return 0xaaaaaa;
	}
}

/**
 * Darken a color
 * @param {number} color - Color as hex
 * @param {number} factor - Darkening factor (0-1)
 * @returns {number} - Darkened color
 */
function darkenColor(color, factor) {
	const r = (color >> 16) & 255;
	const g = (color >> 8) & 255;
	const b = color & 255;
	
	const darkR = Math.floor(r * factor);
	const darkG = Math.floor(g * factor);
	const darkB = Math.floor(b * factor);
	
	return (darkR << 16) | (darkG << 8) | darkB;
}

/**
 * Export current game state
 * @returns {Object} Current game state
 */
export function getGameState() {
	return { ...gameState };
}

/**
 * Update render size when container resizes
 */
export function updateRenderSize() {
	if (camera && renderer && containerElement) {
		const width = containerElement.clientWidth;
		const height = containerElement.clientHeight;
		
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		
		renderer.setSize(width, height);
	}
} 