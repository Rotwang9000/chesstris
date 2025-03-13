/**
 * 3D Renderer Module
 * 
 * Main entry point for the 3D rendering system using Three.js
 */

import * as GameState from '../core/gameState.js';
import * as TetrominoManager from '../core/tetrominoManager.js';
import * as ChessPieceManager from '../core/chessPieceManager.js';

// Three.js components
let scene, camera, renderer, controls;
let boardGroup, tetrominoGroup, chessPieceGroup, ghostGroup;

// Game state
let gameState = null;

// Constants
const CELL_SIZE = 1;
const BOARD_COLOR = 0x1a1a1a;
const GRID_COLOR = 0x333333;
const HOME_ZONE_COLOR_1 = 0x2c3e50;
const HOME_ZONE_COLOR_2 = 0xc0392b;

// Tetromino colors
const TETROMINO_COLORS = {
	'I': 0x00bcd4, // Cyan
	'O': 0xffeb3b, // Yellow
	'T': 0x9c27b0, // Purple
	'J': 0x2196f3, // Blue
	'L': 0xff9800, // Orange
	'S': 0x4caf50, // Green
	'Z': 0xf44336  // Red
};

// Chess piece colors
const CHESS_PIECE_COLORS = {
	player: 0xffffff, // White for player pieces
	opponent: 0xc62828 // Soviet red for opponent pieces
};

// Russian-themed chess piece names
const RUSSIAN_PIECE_NAMES = {
	pawn: 'Peshka',     // Russian Pawn
	rook: 'Ladya',      // Russian Rook (Castle)
	knight: 'Kon',      // Russian Knight (Horse)
	bishop: 'Slon',     // Russian Bishop (Elephant)
	queen: 'Ferz',      // Russian Queen
	king: 'Korol'       // Russian King
};

/**
 * Initialize the 3D renderer
 */
function init() {
	console.log('Initializing 3D renderer...');
	
	// Create scene
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x121212);
	
	// Create camera
	camera = new THREE.PerspectiveCamera(
		60, // Field of view
		window.innerWidth / window.innerHeight, // Aspect ratio
		0.1, // Near clipping plane
		1000 // Far clipping plane
	);
	camera.position.set(10, 15, 20);
	camera.lookAt(0, 0, 0);
	
	// Create renderer
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.shadowMap.enabled = true;
	
	// Add renderer to DOM
	const container = document.getElementById('game-container');
	container.innerHTML = '';
	container.appendChild(renderer.domElement);
	
	// Add orbit controls
	controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.25;
	controls.screenSpacePanning = false;
	controls.maxPolarAngle = Math.PI / 2;
	
	// Create groups for organizing objects
	boardGroup = new THREE.Group();
	tetrominoGroup = new THREE.Group();
	chessPieceGroup = new THREE.Group();
	ghostGroup = new THREE.Group();
	
	scene.add(boardGroup);
	scene.add(tetrominoGroup);
	scene.add(chessPieceGroup);
	scene.add(ghostGroup);
	
	// Add lighting
	addLighting();
	
	// Add camera controls UI
	addCameraControls();
	
	// Add game info display
	addGameInfoDisplay();
	
	// Add event listeners
	window.addEventListener('resize', onWindowResize);
	
	// Start animation loop
	animate();
	
	// Initialize game state
	initGameState();
	
	console.log('3D renderer initialized');
}

/**
 * Add lighting to the scene
 */
function addLighting() {
	// Ambient light
	const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
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
	
	// Point light (for additional highlights)
	const pointLight = new THREE.PointLight(0xffffff, 0.5);
	pointLight.position.set(-10, 15, -10);
	scene.add(pointLight);
}

/**
 * Handle window resize
 */
function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Animation loop
 */
function animate() {
	requestAnimationFrame(animate);
	
	// Update controls
	controls.update();
	
	// Render scene
	renderer.render(scene, camera);
}

/**
 * Initialize game state
 */
function initGameState() {
	// Get game state
	gameState = GameState.getGameState();
	
	// Create board
	createBoard();
	
	// Add event listener for game state updates
	window.addEventListener('gameStateUpdate', handleGameStateUpdate);
	
	// If in offline mode, create a mock game state
	if (GameState.isOfflineMode()) {
		const mockState = GameState.createMockGameState();
		GameState.updateGameState(mockState);
	}
}

/**
 * Handle game state updates
 * @param {CustomEvent} event - The game state update event
 */
function handleGameStateUpdate(event) {
	gameState = event.detail;
	
	// Update board
	updateBoard();
	
	// Update falling piece
	updateFallingPiece();
	
	// Update ghost piece
	updateGhostPiece();
	
	// Update chess pieces
	updateChessPieces();
}

/**
 * Create the game board
 */
function createBoard() {
	// Clear existing board
	while (boardGroup.children.length > 0) {
		boardGroup.remove(boardGroup.children[0]);
	}
	
	const { boardWidth, boardHeight } = gameState;
	
	// Create board base
	const boardGeometry = new THREE.BoxGeometry(
		boardWidth * CELL_SIZE,
		0.5,
		boardHeight * CELL_SIZE
	);
	const boardMaterial = new THREE.MeshStandardMaterial({
		color: BOARD_COLOR,
		roughness: 0.7,
		metalness: 0.2
	});
	const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
	boardMesh.position.set(
		(boardWidth * CELL_SIZE) / 2 - CELL_SIZE / 2,
		-0.25,
		(boardHeight * CELL_SIZE) / 2 - CELL_SIZE / 2
	);
	boardMesh.receiveShadow = true;
	boardGroup.add(boardMesh);
	
	// Create grid lines
	const gridMaterial = new THREE.LineBasicMaterial({ color: GRID_COLOR });
	
	// Horizontal lines
	for (let z = 0; z <= boardHeight; z++) {
		const points = [
			new THREE.Vector3(0, 0, z * CELL_SIZE),
			new THREE.Vector3(boardWidth * CELL_SIZE, 0, z * CELL_SIZE)
		];
		const geometry = new THREE.BufferGeometry().setFromPoints(points);
		const line = new THREE.Line(geometry, gridMaterial);
		boardGroup.add(line);
	}
	
	// Vertical lines
	for (let x = 0; x <= boardWidth; x++) {
		const points = [
			new THREE.Vector3(x * CELL_SIZE, 0, 0),
			new THREE.Vector3(x * CELL_SIZE, 0, boardHeight * CELL_SIZE)
		];
		const geometry = new THREE.BufferGeometry().setFromPoints(points);
		const line = new THREE.Line(geometry, gridMaterial);
		boardGroup.add(line);
	}
	
	// Center the board
	boardGroup.position.set(
		-(boardWidth * CELL_SIZE) / 2,
		0,
		-(boardHeight * CELL_SIZE) / 2
	);
}

/**
 * Update the board based on the current game state
 */
function updateBoard() {
	// Update home zones
	updateHomeZones();
	
	// Update cells
	updateCells();
}

/**
 * Update home zones
 */
function updateHomeZones() {
	// Remove existing home zones
	boardGroup.children.forEach(child => {
		if (child.userData && child.userData.type === 'homeZone') {
			boardGroup.remove(child);
		}
	});
	
	// Add home zones
	const { homeZones } = gameState;
	
	if (!homeZones) return;
	
	for (const playerId in homeZones) {
		const zone = homeZones[playerId];
		const color = playerId === gameState.playerId ? HOME_ZONE_COLOR_1 : HOME_ZONE_COLOR_2;
		
		const geometry = new THREE.BoxGeometry(
			zone.width * CELL_SIZE,
			0.1,
			zone.height * CELL_SIZE
		);
		const material = new THREE.MeshStandardMaterial({
			color,
			transparent: true,
			opacity: 0.7,
			roughness: 0.5,
			metalness: 0.2
		});
		const mesh = new THREE.Mesh(geometry, material);
		
		mesh.position.set(
			zone.x * CELL_SIZE + (zone.width * CELL_SIZE) / 2,
			0.01, // Slightly above the board
			zone.y * CELL_SIZE + (zone.height * CELL_SIZE) / 2
		);
		
		mesh.userData = {
			type: 'homeZone',
			playerId
		};
		
		boardGroup.add(mesh);
	}
}

/**
 * Update cells based on the current game state
 */
function updateCells() {
	// Remove existing tetromino cells
	boardGroup.children.forEach(child => {
		if (child.userData && child.userData.type === 'tetrominoCell') {
			boardGroup.remove(child);
		}
	});
	
	const { board, boardWidth, boardHeight } = gameState;
	
	if (!board) return;
	
	// Add tetromino cells
	for (let y = 0; y < boardHeight; y++) {
		if (!board[y]) continue;
		
		for (let x = 0; x < boardWidth; x++) {
			if (!board[y][x]) continue;
			
			const cell = board[y][x];
			
			if (cell.type === 'tetromino') {
				const geometry = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);
				const material = new THREE.MeshStandardMaterial({
					color: TETROMINO_COLORS[cell.tetrominoType] || 0xffffff,
					roughness: 0.5,
					metalness: 0.2
				});
				const mesh = new THREE.Mesh(geometry, material);
				
				mesh.position.set(
					x * CELL_SIZE + CELL_SIZE / 2,
					CELL_SIZE / 2,
					y * CELL_SIZE + CELL_SIZE / 2
				);
				
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				
				mesh.userData = {
					type: 'tetrominoCell',
					x,
					y,
					tetrominoType: cell.tetrominoType
				};
				
				boardGroup.add(mesh);
			}
		}
	}
}

/**
 * Update the falling tetromino
 */
function updateFallingPiece() {
	// Clear existing falling piece
	while (tetrominoGroup.children.length > 0) {
		tetrominoGroup.remove(tetrominoGroup.children[0]);
	}
	
	const { fallingPiece } = gameState;
	
	if (!fallingPiece) return;
	
	const { type, x, y, shape } = fallingPiece;
	
	// Create falling piece
	for (const [blockX, blockY] of shape) {
		const geometry = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);
		const material = new THREE.MeshStandardMaterial({
			color: TETROMINO_COLORS[type] || 0xffffff,
			roughness: 0.5,
			metalness: 0.2
		});
		const mesh = new THREE.Mesh(geometry, material);
		
		mesh.position.set(
			(x + blockX) * CELL_SIZE + CELL_SIZE / 2,
			CELL_SIZE / 2,
			(y + blockY) * CELL_SIZE + CELL_SIZE / 2
		);
		
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		
		tetrominoGroup.add(mesh);
	}
	
	// Position the tetromino group
	tetrominoGroup.position.copy(boardGroup.position);
}

/**
 * Update the ghost piece
 */
function updateGhostPiece() {
	// Clear existing ghost piece
	while (ghostGroup.children.length > 0) {
		ghostGroup.remove(ghostGroup.children[0]);
	}
	
	const { ghostPiece } = gameState;
	
	if (!ghostPiece) return;
	
	const { type, x, y, shape } = ghostPiece;
	
	// Create ghost piece
	for (const [blockX, blockY] of shape) {
		const geometry = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE, CELL_SIZE);
		const material = new THREE.MeshStandardMaterial({
			color: TETROMINO_COLORS[type] || 0xffffff,
			transparent: true,
			opacity: 0.3,
			roughness: 0.5,
			metalness: 0.2
		});
		const mesh = new THREE.Mesh(geometry, material);
		
		mesh.position.set(
			(x + blockX) * CELL_SIZE + CELL_SIZE / 2,
			CELL_SIZE / 2,
			(y + blockY) * CELL_SIZE + CELL_SIZE / 2
		);
		
		ghostGroup.add(mesh);
	}
	
	// Position the ghost group
	ghostGroup.position.copy(boardGroup.position);
}

/**
 * Create a chess piece mesh with Russian-themed design
 * @param {string} type - The piece type
 * @param {string} playerId - The player ID
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @returns {THREE.Group} The chess piece group
 */
function createChessPieceMesh(type, playerId, x, y) {
	const isCurrentPlayer = playerId === gameState.playerId;
	const pieceGroup = new THREE.Group();
	
	// Base piece (cylinder for Russian style)
	const baseGeometry = new THREE.CylinderGeometry(CELL_SIZE * 0.35, CELL_SIZE * 0.4, CELL_SIZE * 0.3, 16);
	const baseMaterial = new THREE.MeshStandardMaterial({
		color: isCurrentPlayer ? CHESS_PIECE_COLORS.player : CHESS_PIECE_COLORS.opponent,
		roughness: 0.3,
		metalness: 0.7
	});
	const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
	baseMesh.position.y = CELL_SIZE * 0.15;
	baseMesh.castShadow = true;
	baseMesh.receiveShadow = true;
	pieceGroup.add(baseMesh);
	
	// Add distinctive shape based on piece type
	let topMesh;
	
	switch (type) {
		case 'pawn':
			// Russian Peshka - Simple dome top
			const pawnTopGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.2, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
			const pawnTopMaterial = new THREE.MeshStandardMaterial({
				color: isCurrentPlayer ? CHESS_PIECE_COLORS.player : CHESS_PIECE_COLORS.opponent,
				roughness: 0.3,
				metalness: 0.7
			});
			topMesh = new THREE.Mesh(pawnTopGeometry, pawnTopMaterial);
			topMesh.position.y = CELL_SIZE * 0.3;
			topMesh.rotation.x = Math.PI;
			break;
			
		case 'rook':
			// Russian Ladya - Tower with crenellations
			const rookGroup = new THREE.Group();
			
			// Main tower
			const rookTowerGeometry = new THREE.CylinderGeometry(CELL_SIZE * 0.25, CELL_SIZE * 0.25, CELL_SIZE * 0.4, 8);
			const rookTowerMaterial = new THREE.MeshStandardMaterial({
				color: isCurrentPlayer ? CHESS_PIECE_COLORS.player : CHESS_PIECE_COLORS.opponent,
				roughness: 0.3,
				metalness: 0.7
			});
			const rookTower = new THREE.Mesh(rookTowerGeometry, rookTowerMaterial);
			rookTower.position.y = CELL_SIZE * 0.5;
			rookGroup.add(rookTower);
			
			// Crenellations (battlements)
			for (let i = 0; i < 4; i++) {
				const angle = (i / 4) * Math.PI * 2;
				const crenel = new THREE.Mesh(
					new THREE.BoxGeometry(CELL_SIZE * 0.1, CELL_SIZE * 0.1, CELL_SIZE * 0.1),
					rookTowerMaterial
				);
				crenel.position.set(
					Math.cos(angle) * CELL_SIZE * 0.2,
					CELL_SIZE * 0.75,
					Math.sin(angle) * CELL_SIZE * 0.2
				);
				rookGroup.add(crenel);
			}
			
			topMesh = rookGroup;
			break;
			
		case 'knight':
			// Russian Kon - Horse head
			const knightGroup = new THREE.Group();
			
			// Neck
			const knightNeckGeometry = new THREE.CylinderGeometry(
				CELL_SIZE * 0.15, 
				CELL_SIZE * 0.2, 
				CELL_SIZE * 0.3, 
				8
			);
			const knightMaterial = new THREE.MeshStandardMaterial({
				color: isCurrentPlayer ? CHESS_PIECE_COLORS.player : CHESS_PIECE_COLORS.opponent,
				roughness: 0.3,
				metalness: 0.7
			});
			const knightNeck = new THREE.Mesh(knightNeckGeometry, knightMaterial);
			knightNeck.position.y = CELL_SIZE * 0.45;
			knightNeck.rotation.x = Math.PI * 0.15;
			knightGroup.add(knightNeck);
			
			// Head
			const knightHeadGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.18, 16, 16);
			const knightHead = new THREE.Mesh(knightHeadGeometry, knightMaterial);
			knightHead.position.set(CELL_SIZE * 0.1, CELL_SIZE * 0.6, 0);
			knightGroup.add(knightHead);
			
			// Ears
			const earGeometry = new THREE.ConeGeometry(CELL_SIZE * 0.05, CELL_SIZE * 0.1, 8);
			const leftEar = new THREE.Mesh(earGeometry, knightMaterial);
			leftEar.position.set(CELL_SIZE * 0.15, CELL_SIZE * 0.75, CELL_SIZE * 0.05);
			leftEar.rotation.x = -Math.PI * 0.25;
			knightGroup.add(leftEar);
			
			const rightEar = new THREE.Mesh(earGeometry, knightMaterial);
			rightEar.position.set(CELL_SIZE * 0.15, CELL_SIZE * 0.75, -CELL_SIZE * 0.05);
			rightEar.rotation.x = Math.PI * 0.25;
			knightGroup.add(rightEar);
			
			topMesh = knightGroup;
			break;
			
		case 'bishop':
			// Russian Slon - Elephant with tusks
			const bishopGroup = new THREE.Group();
			
			// Main head
			const bishopHeadGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.25, 16, 16);
			const bishopMaterial = new THREE.MeshStandardMaterial({
				color: isCurrentPlayer ? CHESS_PIECE_COLORS.player : CHESS_PIECE_COLORS.opponent,
				roughness: 0.3,
				metalness: 0.7
			});
			const bishopHead = new THREE.Mesh(bishopHeadGeometry, bishopMaterial);
			bishopHead.position.y = CELL_SIZE * 0.5;
			bishopGroup.add(bishopHead);
			
			// Trunk
			const trunkGeometry = new THREE.CylinderGeometry(
				CELL_SIZE * 0.05, 
				CELL_SIZE * 0.08, 
				CELL_SIZE * 0.2, 
				8
			);
			const trunk = new THREE.Mesh(trunkGeometry, bishopMaterial);
			trunk.position.set(CELL_SIZE * 0.2, CELL_SIZE * 0.5, 0);
			trunk.rotation.z = -Math.PI * 0.5;
			bishopGroup.add(trunk);
			
			// Tusks
			const tuskGeometry = new THREE.CylinderGeometry(
				CELL_SIZE * 0.03, 
				CELL_SIZE * 0.03, 
				CELL_SIZE * 0.15, 
				8
			);
			const tuskMaterial = new THREE.MeshStandardMaterial({
				color: isCurrentPlayer ? 0xf0f0f0 : 0xffcccc,
				roughness: 0.2,
				metalness: 0.8
			});
			
			const leftTusk = new THREE.Mesh(tuskGeometry, tuskMaterial);
			leftTusk.position.set(CELL_SIZE * 0.1, CELL_SIZE * 0.4, CELL_SIZE * 0.1);
			leftTusk.rotation.set(Math.PI * 0.1, 0, Math.PI * 0.25);
			bishopGroup.add(leftTusk);
			
			const rightTusk = new THREE.Mesh(tuskGeometry, tuskMaterial);
			rightTusk.position.set(CELL_SIZE * 0.1, CELL_SIZE * 0.4, -CELL_SIZE * 0.1);
			rightTusk.rotation.set(-Math.PI * 0.1, 0, Math.PI * 0.25);
			bishopGroup.add(rightTusk);
			
			topMesh = bishopGroup;
			break;
			
		case 'queen':
			// Russian Ferz - Onion dome with crown
			const queenGroup = new THREE.Group();
			
			// Base cylinder
			const queenBaseGeometry = new THREE.CylinderGeometry(
				CELL_SIZE * 0.2, 
				CELL_SIZE * 0.25, 
				CELL_SIZE * 0.2, 
				16
			);
			const queenMaterial = new THREE.MeshStandardMaterial({
				color: isCurrentPlayer ? CHESS_PIECE_COLORS.player : CHESS_PIECE_COLORS.opponent,
				roughness: 0.3,
				metalness: 0.7
			});
			const queenBase = new THREE.Mesh(queenBaseGeometry, queenMaterial);
			queenBase.position.y = CELL_SIZE * 0.4;
			queenGroup.add(queenBase);
			
			// Onion dome
			const onionPoints = [];
			for (let i = 0; i <= 10; i++) {
				const t = i / 10;
				const bulgeAmount = 0.2 * Math.sin(t * Math.PI);
				onionPoints.push(
					new THREE.Vector2(
						CELL_SIZE * (0.15 + bulgeAmount) * (1 - t),
						CELL_SIZE * 0.3 * t
					)
				);
			}
			
			const onionGeometry = new THREE.LatheGeometry(onionPoints, 16);
			const onionDome = new THREE.Mesh(onionGeometry, queenMaterial);
			onionDome.position.y = CELL_SIZE * 0.5;
			queenGroup.add(onionDome);
			
			// Crown points
			const crownPoints = [];
			for (let i = 0; i < 8; i++) {
				const angle = (i / 8) * Math.PI * 2;
				const point = new THREE.Vector3(
					Math.cos(angle) * CELL_SIZE * 0.12,
					CELL_SIZE * 0.8,
					Math.sin(angle) * CELL_SIZE * 0.12
				);
				
				// Create small sphere for each point
				const pointSphere = new THREE.Mesh(
					new THREE.SphereGeometry(CELL_SIZE * 0.03, 8, 8),
					new THREE.MeshStandardMaterial({
						color: isCurrentPlayer ? 0xf0f0f0 : 0xffcccc,
						roughness: 0.2,
						metalness: 0.9
					})
				);
				pointSphere.position.copy(point);
				queenGroup.add(pointSphere);
			}
			
			topMesh = queenGroup;
			break;
			
		case 'king':
			// Russian Korol - Onion dome with Orthodox cross
			const kingGroup = new THREE.Group();
			
			// Base cylinder
			const kingBaseGeometry = new THREE.CylinderGeometry(
				CELL_SIZE * 0.2, 
				CELL_SIZE * 0.25, 
				CELL_SIZE * 0.2, 
				16
			);
			const kingMaterial = new THREE.MeshStandardMaterial({
				color: isCurrentPlayer ? CHESS_PIECE_COLORS.player : CHESS_PIECE_COLORS.opponent,
				roughness: 0.3,
				metalness: 0.7
			});
			const kingBase = new THREE.Mesh(kingBaseGeometry, kingMaterial);
			kingBase.position.y = CELL_SIZE * 0.4;
			kingGroup.add(kingBase);
			
			// Onion dome (same as queen but slightly larger)
			const kingOnionPoints = [];
			for (let i = 0; i <= 10; i++) {
				const t = i / 10;
				const bulgeAmount = 0.2 * Math.sin(t * Math.PI);
				kingOnionPoints.push(
					new THREE.Vector2(
						CELL_SIZE * (0.18 + bulgeAmount) * (1 - t),
						CELL_SIZE * 0.35 * t
					)
				);
			}
			
			const kingOnionGeometry = new THREE.LatheGeometry(kingOnionPoints, 16);
			const kingOnionDome = new THREE.Mesh(kingOnionGeometry, kingMaterial);
			kingOnionDome.position.y = CELL_SIZE * 0.5;
			kingGroup.add(kingOnionDome);
			
			// Orthodox cross (three horizontal bars)
			const crossMaterial = new THREE.MeshStandardMaterial({
				color: isCurrentPlayer ? 0xf0f0f0 : 0xffcccc,
				roughness: 0.2,
				metalness: 0.9
			});
			
			// Vertical part
			const verticalCross = new THREE.Mesh(
				new THREE.BoxGeometry(CELL_SIZE * 0.05, CELL_SIZE * 0.3, CELL_SIZE * 0.05),
				crossMaterial
			);
			verticalCross.position.y = CELL_SIZE * 0.9;
			kingGroup.add(verticalCross);
			
			// Top horizontal bar
			const topBar = new THREE.Mesh(
				new THREE.BoxGeometry(CELL_SIZE * 0.2, CELL_SIZE * 0.05, CELL_SIZE * 0.05),
				crossMaterial
			);
			topBar.position.y = CELL_SIZE * 1.0;
			kingGroup.add(topBar);
			
			// Middle horizontal bar
			const middleBar = new THREE.Mesh(
				new THREE.BoxGeometry(CELL_SIZE * 0.25, CELL_SIZE * 0.05, CELL_SIZE * 0.05),
				crossMaterial
			);
			middleBar.position.y = CELL_SIZE * 0.9;
			kingGroup.add(middleBar);
			
			// Bottom horizontal bar (slanted)
			const bottomBar = new THREE.Mesh(
				new THREE.BoxGeometry(CELL_SIZE * 0.15, CELL_SIZE * 0.05, CELL_SIZE * 0.05),
				crossMaterial
			);
			bottomBar.position.y = CELL_SIZE * 0.8;
			bottomBar.rotation.z = Math.PI * 0.1;
			kingGroup.add(bottomBar);
			
			topMesh = kingGroup;
			break;
			
		default:
			// Default small sphere
			const defaultTopGeometry = new THREE.SphereGeometry(CELL_SIZE * 0.15, 16, 16);
			const defaultTopMaterial = new THREE.MeshStandardMaterial({
				color: isCurrentPlayer ? CHESS_PIECE_COLORS.player : CHESS_PIECE_COLORS.opponent,
				roughness: 0.3,
				metalness: 0.7
			});
			topMesh = new THREE.Mesh(defaultTopGeometry, defaultTopMaterial);
			topMesh.position.y = CELL_SIZE * 0.4;
	}
	
	pieceGroup.add(topMesh);
	
	// Add name label in Cyrillic
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 32;
	const ctx = canvas.getContext('2d');
	
	// Draw text background
	ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	
	// Draw text
	ctx.fillStyle = isCurrentPlayer ? '#ffffff' : '#ffcccc';
	ctx.font = 'bold 16px Arial';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(RUSSIAN_PIECE_NAMES[type], canvas.width / 2, canvas.height / 2);
	
	const texture = new THREE.CanvasTexture(canvas);
	const labelMaterial = new THREE.SpriteMaterial({ map: texture });
	const label = new THREE.Sprite(labelMaterial);
	
	// Position label above the piece
	label.position.set(0, CELL_SIZE * 1.2, 0);
	label.scale.set(CELL_SIZE * 0.8, CELL_SIZE * 0.2, 1);
	pieceGroup.add(label);
	
	// Position the piece group
	pieceGroup.position.set(
		x * CELL_SIZE + CELL_SIZE / 2,
		0,
		y * CELL_SIZE + CELL_SIZE / 2
	);
	
	// Add user data
	pieceGroup.userData = {
		type: 'chessPiece',
		pieceType: type,
		playerId,
		x,
		y
	};
	
	return pieceGroup;
}

/**
 * Update chess pieces
 */
function updateChessPieces() {
	// Clear existing chess pieces
	while (chessPieceGroup.children.length > 0) {
		chessPieceGroup.remove(chessPieceGroup.children[0]);
	}
	
	const { board, boardWidth, boardHeight } = gameState;
	
	if (!board) return;
	
	// Add chess pieces
	for (let y = 0; y < boardHeight; y++) {
		if (!board[y]) continue;
		
		for (let x = 0; x < boardWidth; x++) {
			if (!board[y][x]) continue;
			
			const cell = board[y][x];
			
			if (cell.piece) {
				const { type, playerId } = cell.piece;
				const pieceMesh = createChessPieceMesh(type, playerId, x, y);
				chessPieceGroup.add(pieceMesh);
			}
		}
	}
	
	// Position the chess piece group
	chessPieceGroup.position.copy(boardGroup.position);
}

/**
 * Add camera control buttons to the UI
 */
function addCameraControls() {
	// Create camera presets container
	const cameraPresets = document.createElement('div');
	cameraPresets.className = 'camera-presets';
	document.body.appendChild(cameraPresets);
	
	// Top view button
	const topViewButton = document.createElement('button');
	topViewButton.textContent = 'Top View';
	topViewButton.addEventListener('click', () => {
		camera.position.set(0, 20, 0);
		camera.lookAt(0, 0, 0);
	});
	cameraPresets.appendChild(topViewButton);
	
	// Player view button
	const playerViewButton = document.createElement('button');
	playerViewButton.textContent = 'Player View';
	playerViewButton.addEventListener('click', () => {
		camera.position.set(0, 10, 20);
		camera.lookAt(0, 0, 0);
	});
	cameraPresets.appendChild(playerViewButton);
	
	// Side view button
	const sideViewButton = document.createElement('button');
	sideViewButton.textContent = 'Side View';
	sideViewButton.addEventListener('click', () => {
		camera.position.set(20, 10, 0);
		camera.lookAt(0, 0, 0);
	});
	cameraPresets.appendChild(sideViewButton);
	
	// Isometric view button
	const isoViewButton = document.createElement('button');
	isoViewButton.textContent = 'Isometric View';
	isoViewButton.addEventListener('click', () => {
		camera.position.set(15, 15, 15);
		camera.lookAt(0, 0, 0);
	});
	cameraPresets.appendChild(isoViewButton);
	
	// Reset view button
	const resetViewButton = document.createElement('button');
	resetViewButton.textContent = 'Reset View';
	resetViewButton.addEventListener('click', () => {
		camera.position.set(10, 15, 20);
		camera.lookAt(0, 0, 0);
	});
	cameraPresets.appendChild(resetViewButton);
	
	// Make functions available globally
	window.topView = () => {
		camera.position.set(0, 20, 0);
		camera.lookAt(0, 0, 0);
	};
	
	window.playerView = () => {
		camera.position.set(0, 10, 20);
		camera.lookAt(0, 0, 0);
	};
	
	window.sideView = () => {
		camera.position.set(20, 10, 0);
		camera.lookAt(0, 0, 0);
	};
	
	window.isoView = () => {
		camera.position.set(15, 15, 15);
		camera.lookAt(0, 0, 0);
	};
	
	window.resetCamera = () => {
		camera.position.set(10, 15, 20);
		camera.lookAt(0, 0, 0);
	};
}

/**
 * Add game info display to the UI
 */
function addGameInfoDisplay() {
	// Create game info container
	const gameInfo = document.createElement('div');
	gameInfo.className = 'game-info-3d';
	document.body.appendChild(gameInfo);
	
	// Add title
	const title = document.createElement('h3');
	title.textContent = 'Game Info';
	gameInfo.appendChild(title);
	
	// Add score
	const scoreItem = document.createElement('div');
	scoreItem.className = 'info-item-3d';
	
	const scoreLabel = document.createElement('span');
	scoreLabel.className = 'info-label-3d';
	scoreLabel.textContent = 'Score:';
	
	const scoreValue = document.createElement('span');
	scoreValue.className = 'info-value-3d';
	scoreValue.id = 'score-value-3d';
	scoreValue.textContent = '0';
	
	scoreItem.appendChild(scoreLabel);
	scoreItem.appendChild(scoreValue);
	gameInfo.appendChild(scoreItem);
	
	// Add level
	const levelItem = document.createElement('div');
	levelItem.className = 'info-item-3d';
	
	const levelLabel = document.createElement('span');
	levelLabel.className = 'info-label-3d';
	levelLabel.textContent = 'Level:';
	
	const levelValue = document.createElement('span');
	levelValue.className = 'info-value-3d';
	levelValue.id = 'level-value-3d';
	levelValue.textContent = '1';
	
	levelItem.appendChild(levelLabel);
	levelItem.appendChild(levelValue);
	gameInfo.appendChild(levelItem);
	
	// Add lines cleared
	const linesItem = document.createElement('div');
	linesItem.className = 'info-item-3d';
	
	const linesLabel = document.createElement('span');
	linesLabel.className = 'info-label-3d';
	linesLabel.textContent = 'Lines:';
	
	const linesValue = document.createElement('span');
	linesValue.className = 'info-value-3d';
	linesValue.id = 'lines-value-3d';
	linesValue.textContent = '0';
	
	linesItem.appendChild(linesLabel);
	linesItem.appendChild(linesValue);
	gameInfo.appendChild(linesItem);
	
	// Add next piece preview section
	const nextPieceSection = document.createElement('div');
	nextPieceSection.className = 'next-piece-preview-3d';
	
	const nextPieceTitle = document.createElement('h4');
	nextPieceTitle.textContent = 'Next Piece';
	nextPieceSection.appendChild(nextPieceTitle);
	
	const nextPieceValue = document.createElement('div');
	nextPieceValue.id = 'next-piece-value-3d';
	nextPieceValue.textContent = '-';
	nextPieceSection.appendChild(nextPieceValue);
	
	gameInfo.appendChild(nextPieceSection);
	
	// Add event listener for game state updates
	window.addEventListener('gameStateUpdate', updateGameInfo);
}

/**
 * Update game info display based on game state
 * @param {CustomEvent} event - The game state update event
 */
function updateGameInfo(event) {
	const state = event.detail;
	
	// Update score
	const scoreElement = document.getElementById('score-value-3d');
	if (scoreElement && state.score !== undefined) {
		scoreElement.textContent = state.score;
	}
	
	// Update level
	const levelElement = document.getElementById('level-value-3d');
	if (levelElement && state.level !== undefined) {
		levelElement.textContent = state.level;
	}
	
	// Update lines cleared
	const linesElement = document.getElementById('lines-value-3d');
	if (linesElement && state.linesCleared !== undefined) {
		linesElement.textContent = state.linesCleared;
	}
	
	// Update next piece
	const nextPieceElement = document.getElementById('next-piece-value-3d');
	if (nextPieceElement && state.nextPiece !== undefined) {
		nextPieceElement.textContent = state.nextPiece.type || '-';
	}
}

// Export functions
export {
	init,
	scene,
	camera,
	renderer,
	controls
}; 