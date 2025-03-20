/**
 * Shaktris Minimal Core Implementation
 * 
 * A simplified version of the game core to help with debugging and testing.
 */

// Import the network manager (at the top of the file)
import * as NetworkManager from './utils/networkManager.js';

// Core game state
let gameState = {
	board: [],
	boardSize: 16,
	currentPlayer: null,
	turnPhase: null, // 'tetris' or 'chess'
	isGameOver: false,
	winner: null,
	currentTetromino: null,
	ghostPiece: null,
	selectedChessPiece: null
};

// Cached DOM elements
let containerElement;
let scene, camera, renderer, controls;
let boardGroup, tetrominoGroup, chessPiecesGroup;
let raycaster, mouse;

// Player colors
const PLAYER_COLORS = {
	1: 0x3333ff, // Blue
	2: 0xff8800  // Orange
};

// Tetromino shapes
const TETROMINO_SHAPES = {
	I: [
		[0, 0, 0, 0],
		[1, 1, 1, 1],
		[0, 0, 0, 0],
		[0, 0, 0, 0]
	],
	O: [
		[1, 1],
		[1, 1]
	],
	T: [
		[0, 1, 0],
		[1, 1, 1],
		[0, 0, 0]
	],
	J: [
		[1, 0, 0],
		[1, 1, 1],
		[0, 0, 0]
	],
	L: [
		[0, 0, 1],
		[1, 1, 1],
		[0, 0, 0]
	],
	S: [
		[0, 1, 1],
		[1, 1, 0],
		[0, 0, 0]
	],
	Z: [
		[1, 1, 0],
		[0, 1, 1],
		[0, 0, 0]
	]
};

/**
 * Initialize the game
 * @param {HTMLElement} container - Game container element
 */
export function initGame(container) {
	console.log('Initializing minimal Shaktris core...');
	
	// Check if THREE is available
	if (typeof THREE === 'undefined') {
		console.error('THREE.js is not loaded! Make sure it is included before gameCore.js');
		return false;
	}
	
	containerElement = container;
	
	try {
		// Initialize raycaster for mouse interaction
		raycaster = new THREE.Raycaster();
		mouse = new THREE.Vector2();
		
		// Set default board size
		gameState.boardSize = 16;
		
		// Create an empty game state - will be replaced with server data
		resetGameState();
		
		// Set up simple 3D scene
		setupScene();
		
		// Create empty board visualization - will be populated with server data
		createBoard();
		
		// Create game status display
		createGameStatusDisplay();
		
		// Add network status display
		createNetworkStatusDisplay();
		
		// Set up network event listeners
		setupNetworkEvents();
		
		// Set up input handlers
		setupInputHandlers();
		
		// Start game loop
		startGameLoop();
		
		// Show tutorial message
		showTutorialMessage();
		
		// Get player name from localStorage or prompt
		const playerName = localStorage.getItem('playerName') || 
				prompt('Enter your player name:', 'Player_' + Math.floor(Math.random() * 1000));
		
		// Save player name for future use
		if (playerName) {
			localStorage.setItem('playerName', playerName);
		}
		
		// Add loading message
		const loadingMsg = document.createElement('div');
		loadingMsg.id = 'loading-message';
		loadingMsg.style.position = 'fixed';
		loadingMsg.style.top = '50%';
		loadingMsg.style.left = '50%';
		loadingMsg.style.transform = 'translate(-50%, -50%)';
		loadingMsg.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
		loadingMsg.style.color = 'white';
		loadingMsg.style.padding = '20px';
		loadingMsg.style.borderRadius = '10px';
		loadingMsg.style.zIndex = '9999';
		loadingMsg.innerHTML = 'Connecting to server...';
		document.body.appendChild(loadingMsg);
		
		// Process URL parameters to see if we need to join a specific game
		const urlParams = new URLSearchParams(window.location.search);
		const gameIdFromUrl = urlParams.get('game');
		
		// Connect to server and join/create a game
		NetworkManager.initialize(playerName)
			.then(() => {
				console.log('Connected to server with player ID:', NetworkManager.getPlayerId());
				
				// Join existing game or create new one, passing the player name
				return NetworkManager.joinGame(gameIdFromUrl, playerName);
			})
			.then(gameData => {
				console.log('Joined game:', gameData);
				
				// Update game ID display
				updateGameIdDisplay(NetworkManager.getGameId());
				
				// Request initial state from server
				NetworkManager.sendMessage('get_game_state', { 
					gameId: NetworkManager.getGameId() 
				});
				
				// Show connected message
				showToastMessage(`Connected as ${playerName}! ${gameIdFromUrl ? 'Joined' : 'Created'} game.`);
				
				// Remove loading message
				if (document.getElementById('loading-message')) {
					document.body.removeChild(document.getElementById('loading-message'));
				}
			})
			.catch(error => {
				console.error('Error connecting to server:', error);
				showToastMessage('Failed to connect to server - playing in offline mode');
				
				// Remove loading message
				if (document.getElementById('loading-message')) {
					document.body.removeChild(document.getElementById('loading-message'));
				}
				
				// In offline mode, create a local game state
				console.log('Initializing offline mode with local game state');
				gameState.board = createLocalBoard();
				gameState.chessPieces = createLocalChessPieces();
				gameState.currentPlayer = 1;
				gameState.turnPhase = 'tetris';
				createBoard();
				updateChessPieces();
				createNewTetromino();
			});
		
		// Show some helpful info
		console.log('Game controls:');
		console.log('- Arrow keys: Move tetromino');
		console.log('- Z/X: Rotate tetromino');
		console.log('- Space: Hard drop tetromino');
		console.log('- Mouse: Click to select/move chess pieces');
		
		console.log('Minimal core initialized');
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
	
	// Create empty structures that will be filled by server data
	gameState.board = [];
	gameState.chessPieces = [];
	
	// Reset game info
	gameState.currentPlayer = null;
	gameState.turnPhase = null;
	gameState.isGameOver = false;
	gameState.winner = null;
	gameState.currentTetromino = null;
	gameState.ghostPiece = null;
	gameState.selectedChessPiece = null;
}

/**
 * Set up home zones on the board
 * NOTE: This is no longer used as home zones are now set up on the server
 */
/*
function setupHomeZones() {
	// Player 1 (blue) - bottom
	for (let z = gameState.boardSize - 2; z < gameState.boardSize; z++) {
		for (let x = 0; x < 8; x++) {
			gameState.board[z][x] = 6; // Blue home zone
		}
	}
	
	// Player 2 (orange) - top
	for (let z = 0; z < 2; z++) {
		for (let x = 8; x < gameState.boardSize; x++) {
			gameState.board[z][x] = 7; // Orange home zone
		}
	}
}
*/

/**
 * Set up the 3D scene
 */
function setupScene() {
	console.log('Setting up 3D scene...');
	
	// Create scene
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x1a1a2e); // Dark blue background
	
	// Create camera
	const width = containerElement.clientWidth || window.innerWidth;
	const height = containerElement.clientHeight || window.innerHeight;
	
	// Enforce minimum height - critical fix
	if (height <= 1) {
		console.warn('Container height is too small, forcing to window height');
		containerElement.style.height = '100%';
		containerElement.style.minHeight = '100vh';
	}
	
	camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
	camera.position.set(20, 25, 20);
	
	// Create renderer
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(width, Math.max(height, window.innerHeight * 0.9));
	renderer.shadowMap.enabled = true;
	
	// Ensure canvas will be visible
	renderer.domElement.style.width = '100%';
	renderer.domElement.style.height = '100vh';
	renderer.domElement.style.display = 'block';
	
	containerElement.appendChild(renderer.domElement);
	
	// Create orbit controls if available
	if (typeof THREE.OrbitControls !== 'undefined') {
		controls = new THREE.OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.15;
		controls.screenSpacePanning = true;
		controls.minDistance = 10;
		controls.maxDistance = 60;
		controls.target.set(8, 0, 8);
		controls.update();
	} else {
		console.warn('OrbitControls not available. Using static camera.');
	}
	
	// Add lights
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
	scene.add(ambientLight);
	
	const sunLight = new THREE.DirectionalLight(0xffffee, 1.0);
	sunLight.position.set(30, 50, 30);
	sunLight.castShadow = true;
	sunLight.shadow.mapSize.width = 1024;
	sunLight.shadow.mapSize.height = 1024;
	scene.add(sunLight);
	
	// Create board group
	boardGroup = new THREE.Group();
	scene.add(boardGroup);
	
	// Create tetromino group
	tetrominoGroup = new THREE.Group();
	tetrominoGroup.name = 'tetrominos';
	scene.add(tetrominoGroup);
	
	// Create chess pieces group
	chessPiecesGroup = new THREE.Group();
	scene.add(chessPiecesGroup);
	
	// Add resize listener
	window.addEventListener('resize', onWindowResize);
}

/**
 * Handle window resize
 */
function onWindowResize() {
	if (!camera || !renderer || !containerElement) return;
	
	const width = containerElement.clientWidth || window.innerWidth;
	const height = containerElement.clientHeight || window.innerHeight;
	
	// Enforce minimum height
	if (height <= 1) {
		containerElement.style.height = '100%';
		containerElement.style.minHeight = '100vh';
	}
	
	camera.aspect = width / Math.max(height, 1);
	camera.updateProjectionMatrix();
	
	renderer.setSize(width, Math.max(height, window.innerHeight * 0.9));
}

/**
 * Create the game board visualization
 */
function createBoard() {
	console.log('Creating game board...');
	
	// Clear existing board cells
	let existingCellsContainer = boardGroup.getObjectByName('cells');
	if (existingCellsContainer) {
		while (existingCellsContainer.children.length > 0) {
			existingCellsContainer.remove(existingCellsContainer.children[0]);
		}
		boardGroup.remove(existingCellsContainer);
	}
	
	// Create cell container
	let cellsContainer = new THREE.Group();
	cellsContainer.name = 'cells';
	boardGroup.add(cellsContainer);
	
	// Offset for centering board
	const offsetX = gameState.boardSize / 2 - 0.5;
	const offsetZ = gameState.boardSize / 2 - 0.5;
	
	// Safety check - if board is not initialized, don't try to render it
	if (!gameState.board || !Array.isArray(gameState.board) || gameState.board.length === 0) {
		console.log('Board not initialized yet, waiting for server data');
		
		// Add a placeholder to indicate we're waiting for board data
		const planeGeometry = new THREE.PlaneGeometry(5, 5);
		const planeMaterial = new THREE.MeshBasicMaterial({
			color: 0x333333,
			side: THREE.DoubleSide
		});
		const plane = new THREE.Mesh(planeGeometry, planeMaterial);
		plane.rotation.x = Math.PI / 2; // Make it horizontal
		cellsContainer.add(plane);
		
		return;
	}
	
	// Create cells for each board position
	for (let z = 0; z < gameState.board.length; z++) {
		const row = gameState.board[z];
		if (!row || !Array.isArray(row)) continue;
		
		for (let x = 0; x < row.length; x++) {
			const cellValue = row[x];
			
			// Skip empty cells
			if (!cellValue) continue;
			
			// Create cell mesh
			const geometry = new THREE.BoxGeometry(1, 1, 1);
			const color = getCellColor(cellValue);
			const material = new THREE.MeshStandardMaterial({ 
				color: color,
				roughness: 0.7,
				metalness: 0.2
			});
			
			const cell = new THREE.Mesh(geometry, material);
			cell.castShadow = true;
			cell.receiveShadow = true;
			
			// Position cell
			cell.position.set(
				x - offsetX,
				0.5, // Half-height above origin
				z - offsetZ
			);
			
			// Add cell to container
			cellsContainer.add(cell);
		}
	}
	
	// Add a simple ground plane to help with orientation
	const groundGeometry = new THREE.PlaneGeometry(50, 50);
	const groundMaterial = new THREE.MeshStandardMaterial({ 
		color: 0x0a0a1a,
		roughness: 1.0,
		metalness: 0.0,
		side: THREE.DoubleSide
	});
	
	const ground = new THREE.Mesh(groundGeometry, groundMaterial);
	ground.rotation.x = Math.PI / 2;
	ground.position.y = -1;
	ground.receiveShadow = true;
	scene.add(ground);
	
	console.log(`Created board with ${cellsContainer.children.length} cells`);
}

/**
 * Reset camera to view the entire board
 * @param {boolean} animate - Whether to animate the transition
 */
function resetCamera(animate = true) {
	if (!camera || !controls) return;
	
	const targetPosition = { x: 20, y: 25, z: 20 };
	const targetLookAt = { x: 8, y: 0, z: 8 };
	
	if (animate && controls) {
		// Animate camera position
		const duration = 1000; // ms
		const startTime = Date.now();
		const startPosition = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
		
		// Get current look-at point
		const currentLookAt = controls.target.clone();
		
		function animateCamera() {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);
			
			// Ease function (ease out cubic)
			const ease = 1 - Math.pow(1 - progress, 3);
			
			// Update camera position
			camera.position.x = startPosition.x + (targetPosition.x - startPosition.x) * ease;
			camera.position.y = startPosition.y + (targetPosition.y - startPosition.y) * ease;
			camera.position.z = startPosition.z + (targetPosition.z - startPosition.z) * ease;
			
			// Update controls target
			controls.target.x = currentLookAt.x + (targetLookAt.x - currentLookAt.x) * ease;
			controls.target.y = currentLookAt.y + (targetLookAt.y - currentLookAt.y) * ease;
			controls.target.z = currentLookAt.z + (targetLookAt.z - currentLookAt.z) * ease;
			
			controls.update();
			
			if (progress < 1) {
				requestAnimationFrame(animateCamera);
			}
		}
		
		animateCamera();
	} else {
		// Instant camera reset
		camera.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
		
		if (controls) {
			controls.target.set(targetLookAt.x, targetLookAt.y, targetLookAt.z);
			controls.update();
		} else {
			camera.lookAt(targetLookAt.x, targetLookAt.y, targetLookAt.z);
		}
	}
}

/**
 * Create a new tetromino for the current player
 */
function createNewTetromino() {
	// Choose a random tetromino type
	const types = Object.keys(TETROMINO_SHAPES);
	const randomType = types[Math.floor(Math.random() * types.length)];
	
	// Set initial position based on current player
	let x, z;
	if (gameState.currentPlayer === 1) {
		// Player 1 starts from bottom
		x = 4;
		z = gameState.boardSize - 4;
	} else {
		// Player 2 starts from top
		x = gameState.boardSize - 4;
		z = 4;
	}
	
	// Create tetromino
	gameState.currentTetromino = {
		type: randomType,
		shape: TETROMINO_SHAPES[randomType],
		position: { x, z },
		rotation: 0,
		color: gameState.currentPlayer === 1 ? 1 : 2, // Use different colors for each player
		fallSpeed: 2000, // Initial speed: 2 seconds per cell
		lastFallTime: Date.now(), // Track last time piece fell
		startHeight: 5 // Start 5 units above the board
	};
	
	// Update ghost piece
	updateGhostPiece();
	
	// Update visuals
	updateTetrominoVisuals();
	
	// Start auto-falling
	startAutoFall();
}

/**
 * Start auto-falling for the current tetromino
 */
function startAutoFall() {
	// Clear any existing interval
	if (gameState.fallInterval) {
		clearInterval(gameState.fallInterval);
	}
	
	// Set new interval
	gameState.fallInterval = setInterval(() => {
		if (gameState.turnPhase === 'tetris' && gameState.currentTetromino) {
			// Move tetromino down in Y-axis (not Z-axis)
			// Reduce the Y height value, which makes it fall towards the board
			if (gameState.currentTetromino.startHeight > 0) {
				gameState.currentTetromino.startHeight -= 0.2;
				
				if (gameState.currentTetromino.startHeight <= 0) {
					gameState.currentTetromino.startHeight = 0;
					
					// Check for collision at the current position
					let collision = false;
					const shape = gameState.currentTetromino.shape;
					const posX = gameState.currentTetromino.position.x;
					const posZ = gameState.currentTetromino.position.z;
					
					// Check each cell in the tetromino shape
					for (let z = 0; z < shape.length; z++) {
						for (let x = 0; x < shape[z].length; x++) {
							if (shape[z][x] === 1) {
								const boardX = posX + x;
								const boardZ = posZ + z;
								
								// Only check for direct overlap with existing blocks
								if (gameState.board[boardZ][boardX] !== 0) {
									collision = true;
									break;
								}
							}
						}
						if (collision) break;
					}
					
					if (collision) {
						// If collision detected, place the tetromino
						placeTetromino();
						clearInterval(gameState.fallInterval);
					}
				}
				
				updateTetrominoVisuals();
			} else {
				// When at board level, try to move down one step
				const shape = gameState.currentTetromino.shape;
				const posX = gameState.currentTetromino.position.x;
				const posZ = gameState.currentTetromino.position.z + 1; // One step down
				let collision = false;
				
				// Check each cell in the tetromino shape
				for (let z = 0; z < shape.length; z++) {
					for (let x = 0; x < shape[z].length; x++) {
						if (shape[z][x] === 1) {
							const boardX = posX + x;
							const boardZ = posZ + z;
						
							
							// Only check for direct overlap with existing blocks
							if (gameState.board[boardZ][boardX] !== 0) {
								collision = true;
								break;
							}
						}
					}
					if (collision) break;
				}
				
				if (!collision) {
					// No collision, move down
					gameState.currentTetromino.position.z += 1;
					updateGhostPiece();
					updateTetrominoVisuals();
				} else {
					// If collision detected, place the tetromino
					placeTetromino();
					clearInterval(gameState.fallInterval);
				}
			}
		}
	}, 250); // Faster interval for smoother falling
}

/**
 * Update the ghost piece (preview of where the tetromino will land)
 */
function updateGhostPiece() {
	if (!gameState.currentTetromino) return;
	
	// Clone the current tetromino
	gameState.ghostPiece = JSON.parse(JSON.stringify(gameState.currentTetromino));
	
	// Drop it down as far as it can go
	gameState.ghostPiece.position.y = 0;


}

/**
 * Update tetromino visuals in the scene
 */
function updateTetrominoVisuals() {
	// Clear existing tetromino group
	while (tetrominoGroup.children.length > 0) {
		tetrominoGroup.remove(tetrominoGroup.children[0]);
	}
	
	// Offset for centering board
	const offsetX = gameState.boardSize / 2 - 0.5;
	const offsetZ = gameState.boardSize / 2 - 0.5;
	
	// Render ghost piece first (so it appears below the current tetromino)
	if (gameState.ghostPiece) {
		const ghostMaterial = new THREE.MeshStandardMaterial({
			color: getCellColor(gameState.ghostPiece.color),
			transparent: true,
			opacity: 0.3,
			roughness: 0.7,
			metalness: 0.2,
			wireframe: true
		});
		
		const shape = gameState.ghostPiece.shape;
		const posX = gameState.ghostPiece.position.x;
		const posZ = gameState.ghostPiece.position.z;
		
		// Create a group for the entire ghost tetromino
		const ghostGroup = new THREE.Group();
		ghostGroup.name = 'ghostPiece';
		
		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (shape[z][x] === 1) {
					// Create a more visible ghost piece with wireframe and grid pattern
					const geometry = new THREE.BoxGeometry(0.95, 0.2, 0.95);
					const block = new THREE.Mesh(geometry, ghostMaterial);
					
					// Add a border to make it more visible
					const edgesGeometry = new THREE.EdgesGeometry(geometry);
					const edgesMaterial = new THREE.LineBasicMaterial({ 
						color: getCellColor(gameState.ghostPiece.color),
						linewidth: 2
					});
					const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
					
					block.position.set(
						(posX + x) - offsetX,
						0.1, // Just above the board
						(posZ + z) - offsetZ
					);
					edges.position.copy(block.position);
					
					ghostGroup.add(block);
					ghostGroup.add(edges);
				}
			}
		}
		
		tetrominoGroup.add(ghostGroup);
	}
	
	// Render current tetromino
	if (gameState.currentTetromino) {
		// Calculate height of the tetromino
		// When startHeight > 0, it's above the board falling down
		// When startHeight = 0, it's at board level following Tetris rules
		let hoverHeight = gameState.currentTetromino.startHeight;
		
		// At board level, add a small hover animation
		if (hoverHeight <= 0) {
			const now = Date.now() / 1000; // Convert to seconds
			hoverHeight = 1.0 + Math.sin(now * 2) * 0.1; // Small hover between 0.9 and 1.1
		}
		
		const material = new THREE.MeshStandardMaterial({
			color: getCellColor(gameState.currentTetromino.color),
			roughness: 0.5,
			metalness: 0.3,
			emissive: getCellColor(gameState.currentTetromino.color),
			emissiveIntensity: 0.2 // Subtle glow
		});
		
		const shape = gameState.currentTetromino.shape;
		const posX = gameState.currentTetromino.position.x;
		const posZ = gameState.currentTetromino.position.z;
		
		// Create a group for the entire tetromino
		const tetrominoGroup3D = new THREE.Group();
		tetrominoGroup3D.name = 'currentTetromino';
		tetrominoGroup.add(tetrominoGroup3D);
		
		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (shape[z][x] === 1) {
					const geometry = new THREE.BoxGeometry(0.95, 1, 0.95); // Slightly smaller to see grid
					const block = new THREE.Mesh(geometry, material);
					
					// Add highlighted edges for better visibility
					const edgesGeometry = new THREE.EdgesGeometry(geometry);
					const edgesMaterial = new THREE.LineBasicMaterial({ 
						color: 0xffffff,
						linewidth: 2
					});
					const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
					
					block.position.set(
						(posX + x) - offsetX,
						0.5, // Half height of block
						(posZ + z) - offsetZ
					);
					edges.position.copy(block.position);
					
					// Shadow settings
					block.castShadow = true;
					block.receiveShadow = true;
					
					tetrominoGroup3D.add(block);
					tetrominoGroup3D.add(edges);
				}
			}
		}
		
		// Set the entire tetromino group to hover
		tetrominoGroup3D.position.y = hoverHeight;
	}
}

/**
 * Create a bounding box for the tetromino to make it more visible
 * @param {Array} shape - Tetromino shape
 * @param {number} posX - X position
 * @param {number} posZ - Z position
 * @param {number} offsetX - X offset
 * @param {number} offsetZ - Z offset
 * @returns {THREE.Object3D} - Bounding box object
 */
function createTetrominoBoundingBox(shape, posX, posZ, offsetX, offsetZ) {
	// Find the bounds of the shape
	let minX = Infinity, maxX = -Infinity;
	let minZ = Infinity, maxZ = -Infinity;
	
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
				minZ = Math.min(minZ, z);
				maxZ = Math.max(maxZ, z);
			}
		}
	}
	
	// Calculate dimensions and center
	const width = maxX - minX + 1;
	const depth = maxZ - minZ + 1;
	const centerX = (posX + minX + maxX) / 2 - offsetX;
	const centerZ = (posZ + minZ + maxZ) / 2 - offsetZ;
	
	// Create a line box
	const geometry = new THREE.BoxGeometry(width, 0.1, depth);
	const edges = new THREE.EdgesGeometry(geometry);
	const material = new THREE.LineBasicMaterial({ 
		color: 0xffff00,
		linewidth: 2,
		transparent: true,
		opacity: 0.7
	});
	
	const box = new THREE.LineSegments(edges, material);
	box.position.set(centerX, 0, centerZ);
	box.name = 'tetrominoBoundingBox';
	
	return box;
}

/**
 * Set up input handlers for game controls
 */
function setupInputHandlers() {
	console.log('Setting up input handlers...');
	
	// Clean up any existing handlers to prevent duplicates
	document.removeEventListener('keydown', handleKeyDown);
	if (renderer && renderer.domElement) {
		renderer.domElement.removeEventListener('click', handleMouseClick);
	}
	
	// Keyboard controls - add to document for maximum reliability
	// Add with capture to intercept before any other handlers
	document.addEventListener('keydown', handleKeyDown, true);
	
	// Create a global keyboard status display
	const keyboardStatus = document.createElement('div');
	keyboardStatus.id = 'keyboard-status';
	keyboardStatus.style.position = 'fixed';
	keyboardStatus.style.top = '10px';
	keyboardStatus.style.left = '50%';
	keyboardStatus.style.transform = 'translateX(-50%)';
	keyboardStatus.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
	keyboardStatus.style.color = '#ffff00';
	keyboardStatus.style.padding = '10px';
	keyboardStatus.style.borderRadius = '5px';
	keyboardStatus.style.fontFamily = 'Arial';
	keyboardStatus.style.fontSize = '14px';
	keyboardStatus.style.zIndex = '1000';
	keyboardStatus.innerHTML = '<strong>Press Arrow Keys to Move Tetromino, Z/X to Rotate, Space to Drop</strong>';
	document.body.appendChild(keyboardStatus);
	
	// Mouse controls for chess piece movement - add with capture
	if (renderer && renderer.domElement) {
		renderer.domElement.addEventListener('click', handleMouseClick, true);
		console.log('Mouse handler added to renderer element');
	} else {
		console.warn('Renderer or domElement not available, adding to document');
		document.addEventListener('click', handleMouseClick, true);
	}
	
	// Add generic click handler to entire document as fallback
	document.addEventListener('click', (event) => {
		console.log('Document click detected at:', event.clientX, event.clientY);
	}, true);
	
	// Add a global event debug log element
	const eventLog = document.createElement('div');
	eventLog.id = 'event-log';
	eventLog.style.position = 'fixed';
	eventLog.style.right = '10px';
	eventLog.style.bottom = '10px';
	eventLog.style.width = '300px';
	eventLog.style.maxHeight = '150px';
	eventLog.style.overflow = 'auto';
	eventLog.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
	eventLog.style.color = '#ffffff';
	eventLog.style.padding = '5px';
	eventLog.style.borderRadius = '5px';
	eventLog.style.fontFamily = 'monospace';
	eventLog.style.fontSize = '12px';
	eventLog.style.zIndex = '1000';
	document.body.appendChild(eventLog);
	
	// Log global events for debugging
	function logEvent(type, event) {
		const logEntry = document.createElement('div');
		logEntry.textContent = `${type}: ${new Date().toISOString().substr(11, 8)}`;
		logEntry.style.borderBottom = '1px solid #333';
		
		const eventLog = document.getElementById('event-log');
		if (eventLog) {
			eventLog.appendChild(logEntry);
			// Keep only last 10 events
			while (eventLog.children.length > 10) {
				eventLog.removeChild(eventLog.firstChild);
			}
			// Scroll to bottom
			eventLog.scrollTop = eventLog.scrollHeight;
		}
	}
	
	// Add event listeners for global event tracking
	document.addEventListener('keydown', (e) => logEvent(`Keydown: ${e.key}`, e), true);
	document.addEventListener('click', (e) => logEvent(`Click: ${e.clientX},${e.clientY}`, e), true);
	
	console.log('Input handlers set up successfully');
}

/**
 * Handle keyboard input
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
	// Capture the event in all cases to prevent browser scrolling
	event.preventDefault();
	event.stopPropagation();
	
	// Add a visible keypress indicator on screen
	showKeyPress(event.key);
	
	// Log all key events regardless of phase
	console.log(`Key pressed: ${event.key} (phase: ${gameState.turnPhase})`);
	
	// Check if we're in tetris phase and have a tetromino
	if (gameState.turnPhase !== 'tetris' || !gameState.currentTetromino) {
		console.log(`Key ignored: ${event.key} - wrong phase (${gameState.turnPhase}) or no tetromino`);
		showToastMessage(`Can't move - currently in ${gameState.turnPhase} phase`);
		return false;
	}
	
	let actionTaken = true;
	
	switch (event.key) {
		case 'ArrowLeft':
			console.log('Moving tetromino LEFT');
			moveTetromino(-1, 0);
			break;
		case 'ArrowRight':
			console.log('Moving tetromino RIGHT');
			moveTetromino(1, 0);
			break;
		case 'ArrowDown':
			console.log('Moving tetromino DOWN');
			moveTetromino(0, 1);
			break;
		case 'ArrowUp':
			console.log('Moving tetromino UP');
			moveTetromino(0, -1);
			break;
		case 'z':
		case 'Z':
			console.log('Rotating tetromino COUNTER-CLOCKWISE');
			rotateTetromino(false);
			break;
		case 'x':
		case 'X':
			console.log('Rotating tetromino CLOCKWISE');
			rotateTetromino(true);
			break;
		case ' ': // Space for hard drop
			console.log('Hard dropping tetromino');
			hardDropTetromino();
			break;
		default:
			console.log(`Unhandled key: ${event.key}`);
			actionTaken = false;
			break;
	}
	
	// Always update visuals after any key press for responsiveness
	updateTetrominoVisuals();
	
	// Show directional indicator for movement keys
	if (actionTaken) {
		showActionFeedback(event.key);
	}
	
	return false;
}

/**
 * Show key press on screen
 * @param {string} key - Key pressed
 */
function showKeyPress(key) {
	// Create or get key press indicator
	let keyIndicator = document.getElementById('key-indicator');
	if (!keyIndicator) {
		keyIndicator = document.createElement('div');
		keyIndicator.id = 'key-indicator';
		keyIndicator.style.position = 'fixed';
		keyIndicator.style.bottom = '50px';
		keyIndicator.style.left = '10px';
		keyIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		keyIndicator.style.color = '#00ff00';
		keyIndicator.style.padding = '10px';
		keyIndicator.style.borderRadius = '5px';
		keyIndicator.style.fontFamily = 'monospace';
		keyIndicator.style.fontSize = '16px';
		keyIndicator.style.zIndex = '1000';
		document.body.appendChild(keyIndicator);
	}
	
	// Display the key
	keyIndicator.textContent = `Key Pressed: ${key}`;
	
	// Clear after 1 second
	setTimeout(() => {
		keyIndicator.textContent = '';
	}, 1000);
}

/**
 * Handle mouse click for chess piece selection and movement
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseClick(event) {
	// Log click event for debugging
	console.log('Mouse click detected!', event);
	console.log(`Mouse coordinates: ${event.clientX}, ${event.clientY}`);
	
	// Only handle clicks in chess phase
	if (gameState.turnPhase !== 'chess') {
		console.log("Click ignored - not in chess phase (current phase: " + gameState.turnPhase + ")");
		showToastMessage("Currently in " + gameState.turnPhase + " phase. Switch to chess phase to move pieces.");
		return;
	}
	
	// Prevent default behavior to ensure we capture the event
	event.preventDefault();
	event.stopPropagation();
	
	// Show click indicator
	showClickIndicator(event.clientX, event.clientY);
	
	// Calculate mouse position in normalized device coordinates (-1 to +1)
	const rect = renderer.domElement.getBoundingClientRect();
	mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	
	console.log(`Normalized mouse coordinates: ${mouse.x.toFixed(2)}, ${mouse.y.toFixed(2)}`);
	
	// Update the raycaster
	raycaster.setFromCamera(mouse, camera);
	
	// First, try to intersect with move indicators
	const moveIndicators = scene.getObjectByName('moveIndicators');
	if (moveIndicators) {
		const moveIntersects = raycaster.intersectObjects(moveIndicators.children, false);
		
		if (moveIntersects.length > 0) {
			const indicator = moveIntersects[0].object;
			const x = indicator.userData.moveX;
			const z = indicator.userData.moveZ;
			
			console.log(`Clicked on valid move indicator at ${x}, ${z}`);
			showToastMessage(`Moving piece to ${x}, ${z}`);
			
			// Execute the move
			handleChessMove(x, z);
			return;
		}
	}
	
	// Check for intersections with chess pieces
	const pieceIntersects = raycaster.intersectObjects(chessPiecesGroup.children, true);
	
	if (pieceIntersects.length > 0) {
		console.log("Piece intersection detected!", pieceIntersects[0].object);
		
		// Get the topmost intersected piece
		const pieceObject = pieceIntersects[0].object;
		let pieceData = null;
		
		// The userData might be on the parent if it's a group
		if (pieceObject.userData && pieceObject.userData.pieceIndex !== undefined) {
			pieceData = pieceObject.userData;
			console.log("Found piece data on object:", pieceData);
		} else if (pieceObject.parent && pieceObject.parent.userData && 
				  pieceObject.parent.userData.pieceIndex !== undefined) {
			pieceData = pieceObject.parent.userData;
			console.log("Found piece data on parent:", pieceData);
		} else {
			// Try to traverse up the parent chain
			let currentObj = pieceObject;
			for (let i = 0; i < 3; i++) { // Check up to 3 levels up
				if (!currentObj.parent) break;
				currentObj = currentObj.parent;
				if (currentObj.userData && currentObj.userData.pieceIndex !== undefined) {
					pieceData = currentObj.userData;
					console.log("Found piece data on ancestor:", pieceData);
					break;
				}
			}
		}
		
		if (pieceData && pieceData.pieceIndex !== undefined) {
			const piece = gameState.chessPieces[pieceData.pieceIndex];
			console.log("Found piece:", piece);
			
			if (piece && piece.player === gameState.currentPlayer) {
				// Highlight the selected piece
				highlightSelectedPiece(piece);
				
				// Select the piece
				gameState.selectedChessPiece = piece;
				console.log(`Selected piece: ${piece.type} at ${piece.x}, ${piece.z}`);
				showToastMessage(`Selected ${piece.type} at ${piece.x}, ${piece.z}`);
				
				// Show valid moves
				showValidMoves(true);
				return;
			} else if (piece) {
				console.log(`Cannot select opponent's piece (player ${piece.player})`);
				showToastMessage(`This is Player ${piece.player}'s piece. You are Player ${gameState.currentPlayer}.`);
			}
		} else {
			console.log("No piece data found in intersection");
		}
	} else {
		console.log("No piece intersections found");
	}
	
	// Check for intersections with the board
	const boardIntersects = raycaster.intersectObjects(boardGroup.children, true);
	
	if (boardIntersects.length > 0) {
		// Get the position on the board
		const position = boardIntersects[0].point;
		
		// Convert to board coordinates
		const offsetX = gameState.boardSize / 2 - 0.5;
		const offsetZ = gameState.boardSize / 2 - 0.5;
		
		const boardX = Math.round(position.x + offsetX);
		const boardZ = Math.round(position.z + offsetZ);
		
		console.log(`Board intersection at position: ${boardX}, ${boardZ}`);
		
		// Check if coordinates are valid
		if (boardX >= 0 && boardX < gameState.boardSize &&
			boardZ >= 0 && boardZ < gameState.boardSize) {
			
			// Handle chess move
			handleChessMove(boardX, boardZ);
		}
	} else {
		console.log("No board intersection detected");
	}
	
	// If we got here and still have a selected piece, deselect it if clicked elsewhere
	if (gameState.selectedChessPiece && 
		!(moveIndicators && raycaster.intersectObjects(moveIndicators.children, false).length > 0) &&
		pieceIntersects.length === 0) {
		console.log("Deselecting piece - clicked elsewhere");
		gameState.selectedChessPiece = null;
		showValidMoves(false);
		showToastMessage("Piece deselected");
	}
}

/**
 * Show click indicator at the specified position
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function showClickIndicator(x, y) {
	// Create indicator
	const indicator = document.createElement('div');
	indicator.style.position = 'fixed';
	indicator.style.left = (x - 15) + 'px';
	indicator.style.top = (y - 15) + 'px';
	indicator.style.width = '30px';
	indicator.style.height = '30px';
	indicator.style.borderRadius = '50%';
	indicator.style.border = '2px solid #00ff00';
	indicator.style.zIndex = '9999';
	indicator.style.pointerEvents = 'none';
	indicator.style.animation = 'clickRipple 0.6s linear';
	
	// Add animation style if not already added
	if (!document.getElementById('click-animation-style')) {
		const style = document.createElement('style');
		style.id = 'click-animation-style';
		style.textContent = `
			@keyframes clickRipple {
				0% { transform: scale(0.5); opacity: 1; }
				100% { transform: scale(1.5); opacity: 0; }
			}
		`;
		document.head.appendChild(style);
	}
	
	// Add to body and remove after animation
	document.body.appendChild(indicator);
	setTimeout(() => {
		document.body.removeChild(indicator);
	}, 600);
}

/**
 * Move the current tetromino
 * @param {number} dx - X movement
 * @param {number} dz - Z movement
 * @returns {boolean} - Whether the move was successful
 */
function moveTetromino(dx, dz) {
	if (!gameState.currentTetromino) return false;
	
	const newX = gameState.currentTetromino.position.x + dx;
	const newZ = gameState.currentTetromino.position.z + dz;
	
	// Only check for boundary collisions and direct block overlaps
	const shape = gameState.currentTetromino.shape;
	// let collision = false;
	
	// for (let z = 0; z < shape.length; z++) {
	// 	for (let x = 0; x < shape[z].length; x++) {
	// 		if (shape[z][x] === 1) {
	// 			const boardX = newX + x;
	// 			const boardZ = newZ + z;
				
	// 			// Check board boundaries
	// 			if (boardX < 0 || boardX >= gameState.boardSize || 
	// 				boardZ < 0 || boardZ >= gameState.boardSize) {
	// 				collision = true;
	// 				break;
	// 			}
				
	// 			// Check for direct overlap with existing blocks
	// 			if (gameState.board[boardZ][boardX] !== 0) {
	// 				collision = true;
	// 				break;
	// 			}
	// 		}
	// 	}
	// 	if (collision) break;
	// }
	
	// if (collision) {
	// 	// Show feedback for blocked move
	// 	showToastMessage('Cannot move - collision detected');
	// 	return false;
	// }
	
	// Perform the move - no collision detected
	gameState.currentTetromino.position.x = newX;
	gameState.currentTetromino.position.z = newZ;
	
	// Update ghost piece
	updateGhostPiece();
	
	// Update visuals
	updateTetrominoVisuals();
	
	return true;
}

/**
 * Rotate the current tetromino
 * @param {boolean} clockwise - Whether to rotate clockwise
 * @returns {boolean} - Whether the rotation was successful
 */
function rotateTetromino(clockwise) {
	if (!gameState.currentTetromino) return false;
	
	// Clone the current shape
	const currentShape = gameState.currentTetromino.shape;
	const size = currentShape.length;
	
	// Create a new shape array
	let newShape = Array(size).fill().map(() => Array(size).fill(0));
	
	// Rotate the shape
	for (let z = 0; z < size; z++) {
		for (let x = 0; x < size; x++) {
			if (clockwise) {
				newShape[x][size - 1 - z] = currentShape[z][x];
			} else {
				newShape[size - 1 - x][z] = currentShape[z][x];
			}
		}
	}
	
	// Check if the rotation is valid
	if (!checkTetrominoCollision(newShape, gameState.currentTetromino.position.x, gameState.currentTetromino.position.z)) {
		gameState.currentTetromino.shape = newShape;
		
		// Update ghost piece
		updateGhostPiece();
		
		// Update visuals
		updateTetrominoVisuals();
		
		// Show feedback
		showToastMessage(`Rotated tetromino ${clockwise ? 'clockwise' : 'counter-clockwise'}`);
		return true;
	} else {
		// Try wall kicks - standard SRS wall kick attempts
		const kicks = [
			{dx: 1, dz: 0},   // Try right
			{dx: -1, dz: 0},  // Try left
			{dx: 0, dz: 1},   // Try down
			{dx: 0, dz: -1},  // Try up
			{dx: 2, dz: 0},   // Try 2 spaces right
			{dx: -2, dz: 0}   // Try 2 spaces left
		];
		
		// Try each wall kick
		for (const kick of kicks) {
			const kickX = gameState.currentTetromino.position.x + kick.dx;
			const kickZ = gameState.currentTetromino.position.z + kick.dz;
			
			if (!checkTetrominoCollision(newShape, kickX, kickZ)) {
				// Wall kick succeeded
				gameState.currentTetromino.shape = newShape;
				gameState.currentTetromino.position.x = kickX;
				gameState.currentTetromino.position.z = kickZ;
				
				// Update ghost piece
				updateGhostPiece();
				
				// Update visuals
				updateTetrominoVisuals();
				
				// Show feedback
				showToastMessage(`Rotated with wall kick ${clockwise ? 'clockwise' : 'counter-clockwise'}`);
				return true;
			}
		}
		
		// All wall kicks failed
		showToastMessage('Rotation blocked - collision detected');
		console.log('Rotation blocked - collision detected');
		return false;
	}
}

/**
 * Drop the tetromino to the lowest possible position
 * @returns {boolean} - Whether the drop was successful
 */
function hardDropTetromino() {
	if (!gameState.currentTetromino || !gameState.ghostPiece) return false;
	
	// Move the tetromino to the ghost position
	gameState.currentTetromino.position = { ...gameState.ghostPiece.position };
	
	// Show visual feedback
	const dropCount = Math.abs(gameState.ghostPiece.position.z - gameState.currentTetromino.position.z);
	showToastMessage(`Hard dropped tetromino ${dropCount} spaces`);
	
	// Show drop animation
	showDropAnimation();
	
	// Update visuals
	updateTetrominoVisuals();
	
	// Clear any existing fall interval
	if (gameState.fallInterval) {
		clearInterval(gameState.fallInterval);
		gameState.fallInterval = null;
	}
	
	// Place the tetromino (with a slight delay for visual effect)
	setTimeout(() => {
		// Make sure the tetromino is still there (hasn't been cleared by something else)
		if (gameState.currentTetromino) {
			placeTetromino();
		}
	}, 300);
	
	return true;
}

/**
 * Show drop animation for hard drops
 */
function showDropAnimation() {
	if (!gameState.currentTetromino) return;
	
	// Create animation element
	const animElement = document.createElement('div');
	animElement.style.position = 'fixed';
	animElement.style.top = '50%';
	animElement.style.left = '50%';
	animElement.style.transform = 'translate(-50%, -50%)';
	animElement.style.color = 'white';
	animElement.style.fontSize = '48px';
	animElement.style.fontWeight = 'bold';
	animElement.style.textShadow = '0 0 10px rgba(0,255,0,0.8)';
	animElement.style.zIndex = '1000';
	animElement.style.pointerEvents = 'none';
	animElement.style.opacity = '0';
	animElement.style.transition = 'all 0.3s';
	animElement.textContent = 'LOCKED!';
	
	document.body.appendChild(animElement);
	
	// Animation sequence
	setTimeout(() => { 
		animElement.style.opacity = '1';
		animElement.style.fontSize = '72px';
	}, 50);
	
	setTimeout(() => {
		animElement.style.opacity = '0';
	}, 400);
	
	setTimeout(() => {
		document.body.removeChild(animElement);
	}, 700);
}

/**
 * Place the current tetromino on the board
 */
function placeTetromino() {
	if (!gameState.currentTetromino) return;
	
	// Get tetromino shape and position
	const shape = gameState.currentTetromino.shape;
	const posX = gameState.currentTetromino.position.x;
	const posZ = gameState.currentTetromino.position.z;
	const color = gameState.currentTetromino.color;
	
	// Check if any tetromino blocks would overlap with existing blocks
	// This happens when tetromino is dropping from above and hits something
	let wouldCollide = false;
	
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// Make sure we're within board bounds
				if (boardX >= 0 && boardX < gameState.boardSize && 
					boardZ >= 0 && boardZ < gameState.boardSize) {
					
					// Check if this position already has a block
					if (gameState.board[boardZ][boardX] !== 0) {
						wouldCollide = true;
						break;
					}
				}
			}
		}
		if (wouldCollide) break;
	}
	
	if (wouldCollide) {
		// Show explosion animation
		showExplosionAnimation(posX, posZ);
		
		// Switch to chess phase for this player without affecting others
		gameState.turnPhase = 'chess';
		console.log('Tetromino exploded - switched to chess phase');
		updateGameStatusDisplay();
		
		// Create the data to send before clearing the currentTetromino
		const tetrominoData = {
			type: gameState.currentTetromino.type,
			position: { x: posX, z: posZ },
			shape: shape,
			exploded: true
		};
		
		// Clear the current tetromino
		gameState.currentTetromino = null;
		gameState.ghostPiece = null;
		
		// Update visuals
		updateTetrominoVisuals();
		
		// Send the exploded tetromino event to server
		sendTetrominoPlacementToServer(tetrominoData);
		
		return;
	}
	
	// Add tetromino blocks to the board
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				//if this spot doesn't exist on the board, add it
				if (!gameState.board[boardZ]) {
					gameState.board[boardZ] = [];
				}
				//if this spot doesn't exist on the board, add it
				if (!gameState.board[boardZ][boardX]) {
					gameState.board[boardZ][boardX] = 0;
				}

				gameState.board[boardZ][boardX] = color;
			
			}
		}
	}
	
	// Create tetromino data before clearing the reference
	const tetrominoPlacementData = {
		type: gameState.currentTetromino.type,
		position: { x: posX, z: posZ },
		shape: shape,
		exploded: false
	};
	
	// Check for completed rows
	checkCompletedRows();
	
	// Recreate the board visualization
	createBoard();
	
	// Switch to chess phase for this player without affecting others
	gameState.turnPhase = 'chess';
	console.log('Switched to chess phase');
	
	// Clear the current tetromino
	gameState.currentTetromino = null;
	gameState.ghostPiece = null;
	
	// Update visuals
	updateTetrominoVisuals();
	updateGameStatusDisplay();
	
	// Send the tetromino placement to server
	sendTetrominoPlacementToServer(tetrominoPlacementData);
}

/**
 * Send tetromino placement to server
 * @param {Object} tetrominoData - Data about the placed tetromino
 */
function sendTetrominoPlacementToServer(tetrominoData) {
	// Add current player and timestamp
	const placementData = {
		...tetrominoData,
		player: gameState.currentPlayer,
		timestamp: Date.now(),
		board: gameState.board // Include the updated board state
	};
	
	// Submit to server using NetworkManager
	NetworkManager.sendMessage('tetromino_placed', placementData);
	
	console.log('Sent tetromino placement to server:', placementData);
}

/**
 * Check if the tetromino collides with the board or goes out of bounds
 * @param {Array} shape - Tetromino shape
 * @param {number} posX - X position
 * @param {number} posZ - Z position
 * @returns {boolean} - Whether there's a collision
 */
function checkTetrominoCollision(shape, posX, posZ) {
	// Check each block in the tetromino
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// Check board boundaries ... there are no boundaries!
				// if (boardX < 0 || boardX >= gameState.boardSize || 
				// 	boardZ < 0 || boardZ >= gameState.boardSize) {
				// 	return true; // Out of bounds
				// }
				
				// If this is for the current tetromino (not ghost), ignore collision checking
				// when the tetromino is still above the board
				if (gameState.currentTetromino && 
					gameState.currentTetromino.startHeight > 0 &&
					shape === gameState.currentTetromino.shape) {
					continue; // Skip collision check while above board
				}
				
				// Only check for direct overlap with existing blocks - ignore all other cells
				if (gameState.board[boardZ][boardX] !== 0) {
					return true; // Direct collision with existing block
				}
			}
		}
	}
	
	return false; // No collision
}

/**
 * Check for completed rows and remove them
 */
function checkCompletedRows() {
	// Safety check - if board is not initialized, do nothing
	if (!gameState.board || !Array.isArray(gameState.board) || gameState.board.length === 0) {
		return;
	}
	
	// Check horizontal rows
	for (let z = 0; z < gameState.board.length; z++) {
		const row = gameState.board[z];
		if (!row || !Array.isArray(row)) continue;
		
		let cellCount = 0;
		
		// Count filled cells in this row
		for (let x = 0; x < row.length; x++) {
			if (row[x] !== 0) {
				cellCount++;
			}
		}
		
		// If row has at least 8 connected cells, consider clearing it
		if (cellCount >= 8) {
			// Clear the row (except home zones)
			for (let x = 0; x < row.length; x++) {
				// Don't clear home zones
				if (row[x] !== 6 && row[x] !== 7) {
					row[x] = 0;
				}
			}
		}
	}
	
	// Check vertical columns
	// First determine the board width based on the first row
	const boardWidth = gameState.board[0] ? gameState.board[0].length : 0;
	if (boardWidth === 0) return;
	
	for (let x = 0; x < boardWidth; x++) {
		let cellCount = 0;
		
		// Count filled cells in this column
		for (let z = 0; z < gameState.board.length; z++) {
			const row = gameState.board[z];
			if (!row || !Array.isArray(row) || x >= row.length) continue;
			
			if (row[x] !== 0) {
				cellCount++;
			}
		}
		
		// If column has at least 8 connected cells, consider clearing it
		if (cellCount >= 8) {
			// Clear the column (except home zones)
			for (let z = 0; z < gameState.board.length; z++) {
				const row = gameState.board[z];
				if (!row || !Array.isArray(row) || x >= row.length) continue;
				
				// Don't clear home zones
				if (row[x] !== 6 && row[x] !== 7) {
					row[x] = 0;
				}
			}
		}
	}
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
			
			// Update game status display
			updateGameStatusDisplay();
			
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
	
	// Reset camera to ensure board is visible
	resetCamera(true);
	
	console.log('Game loop started');
}

/**
 * Switch to the next player's turn
 */
export function nextTurn() {
	// Clear any existing fall interval
	if (gameState.fallInterval) {
		clearInterval(gameState.fallInterval);
		gameState.fallInterval = null;
	}
	
	// Switch players
	gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
	
	// Reset to tetris phase
	gameState.turnPhase = 'tetris';
	
	// Create new tetromino for the current player
	createNewTetromino();
	
	// Show turn change notification
	showToastMessage(`Player ${gameState.currentPlayer}'s turn`);
	
	console.log(`Player ${gameState.currentPlayer}'s turn`);
	
	// Update game status display
	updateGameStatusDisplay();
}

/**
 * Export current game state
 * @returns {Object} Current game state
 */
export function getGameState() {
	return { ...gameState };
}

/**
 * Export resetCamera function for external use
 * @param {boolean} animate - Whether to animate the transition
 */
export function resetCameraView(animate = true) {
	resetCamera(animate);
}

/**
 * Update render size when container resizes
 */
export function updateRenderSize() {
	if (camera && renderer && containerElement) {
		const width = containerElement.clientWidth || window.innerWidth;
		const height = containerElement.clientHeight || window.innerHeight;
		
		// Enforce minimum height
		if (height <= 1) {
			containerElement.style.height = '100vh';
			containerElement.style.minHeight = '100vh';
		}
		
		camera.aspect = width / Math.max(height, 1);
		camera.updateProjectionMatrix();
		
		renderer.setSize(width, Math.max(height, window.innerHeight * 0.9));
	}
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
 * Add chess pieces to the board
 * NOTE: This is no longer used as chess pieces are now provided by the server
 */
/*
function addChessPieces() {
	// Define chess piece types and positions for player 1
	const player1Pieces = [
		{ type: 'pawn', x: 0, z: 14 },
		{ type: 'pawn', x: 1, z: 14 },
		{ type: 'pawn', x: 2, z: 14 },
		{ type: 'pawn', x: 3, z: 14 },
		{ type: 'pawn', x: 4, z: 14 },
		{ type: 'pawn', x: 5, z: 14 },
		{ type: 'pawn', x: 6, z: 14 },
		{ type: 'pawn', x: 7, z: 14 },
		{ type: 'rook', x: 0, z: 15 },
		{ type: 'knight', x: 1, z: 15 },
		{ type: 'bishop', x: 2, z: 15 },
		{ type: 'queen', x: 3, z: 15 },
		{ type: 'king', x: 4, z: 15 },
		{ type: 'bishop', x: 5, z: 15 },
		{ type: 'knight', x: 6, z: 15 },
		{ type: 'rook', x: 7, z: 15 }
	].map(piece => ({ ...piece, player: 1 }));
	
	// Define chess piece types and positions for player 2
	const player2Pieces = [
		{ type: 'pawn', x: 8, z: 1 },
		{ type: 'pawn', x: 9, z: 1 },
		{ type: 'pawn', x: 10, z: 1 },
		{ type: 'pawn', x: 11, z: 1 },
		{ type: 'pawn', x: 12, z: 1 },
		{ type: 'pawn', x: 13, z: 1 },
		{ type: 'pawn', x: 14, z: 1 },
		{ type: 'pawn', x: 15, z: 1 },
		{ type: 'rook', x: 8, z: 0 },
		{ type: 'knight', x: 9, z: 0 },
		{ type: 'bishop', x: 10, z: 0 },
		{ type: 'queen', x: 11, z: 0 },
		{ type: 'king', x: 12, z: 0 },
		{ type: 'bishop', x: 13, z: 0 },
		{ type: 'knight', x: 14, z: 0 },
		{ type: 'rook', x: 15, z: 0 }
	].map(piece => ({ ...piece, player: 2 }));
	
	// Add all pieces to game state
	gameState.chessPieces = [...player1Pieces, ...player2Pieces];
}
*/

/**
 * Show or hide valid moves for the selected chess piece
 * @param {boolean} show - Whether to show or hide valid moves
 */
function showValidMoves(show = true) {
	// Clear existing move indicators
	const moveIndicators = scene.getObjectByName('moveIndicators');
	if (moveIndicators) {
		scene.remove(moveIndicators);
	}
	
	// If not showing or no piece selected, return
	if (!show || !gameState.selectedChessPiece) return;
	
	// Create move indicators group
	const indicatorsGroup = new THREE.Group();
	indicatorsGroup.name = 'moveIndicators';
	
	// Offset for centering board
	const offsetX = gameState.boardSize / 2 - 0.5;
	const offsetZ = gameState.boardSize / 2 - 0.5;
	
	// Get valid moves for the selected piece
	const validMoves = getValidMoves(gameState.selectedChessPiece);
	
	// Create visual indicators for valid moves
	for (const move of validMoves) {
		const indicator = new THREE.Mesh(
			new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16),
			new THREE.MeshBasicMaterial({
				color: 0x00ff00,
				transparent: true,
				opacity: 0.5
			})
		);
		
		// Check if the target position has a cell (it should, otherwise it wouldn't be a valid move)
		const cellHeight = isValidPosition(move.x, move.z) ? 1 : 0;
		
		indicator.position.set(
			move.x - offsetX,
			cellHeight + 0.1, // Position just above the cell (0.1 units above)
			move.z - offsetZ
		);
		
		indicator.userData = { moveX: move.x, moveZ: move.z };
		indicatorsGroup.add(indicator);
	}
	
	scene.add(indicatorsGroup);
}

/**
 * Get valid moves for a chess piece
 * @param {Object} piece - Chess piece
 * @returns {Array} - Array of valid move positions
 */
function getValidMoves(piece) {
	const validMoves = [];
	
	switch (piece.type) {
		case 'pawn':
			// Pawns move forward based on player
			const direction = piece.player === 1 ? -1 : 1;
			const forwardPos = { x: piece.x, z: piece.z + direction };
			
			// Forward movement
			if (isValidPosition(forwardPos.x, forwardPos.z) && !isOccupied(forwardPos.x, forwardPos.z)) {
				validMoves.push(forwardPos);
				
				// Check for double move on first move
				const isPawnOnStartingRank = (piece.player === 1 && piece.z === 14) || 
											 (piece.player === 2 && piece.z === 1);
											 
				if (isPawnOnStartingRank) {
					const doubleMovePos = { x: piece.x, z: piece.z + (direction * 2) };
					// Make sure both the first and second squares are unoccupied
					if (isValidPosition(doubleMovePos.x, doubleMovePos.z) && 
						!isOccupied(doubleMovePos.x, doubleMovePos.z)) {
						validMoves.push(doubleMovePos);
					}
				}
			}
			
			// Diagonal captures
			for (const dx of [-1, 1]) {
				const capturePos = { x: piece.x + dx, z: piece.z + direction };
				if (isValidPosition(capturePos.x, capturePos.z) && isEnemyOccupied(capturePos.x, capturePos.z, piece.player)) {
					validMoves.push(capturePos);
				}
			}
			break;
			
		case 'rook':
			// Rooks move horizontally and vertically
			addLinearMoves(piece, validMoves, [
				{ dx: 1, dz: 0 },
				{ dx: -1, dz: 0 },
				{ dx: 0, dz: 1 },
				{ dx: 0, dz: -1 }
			]);
			break;
			
		case 'knight':
			// Knights move in L-shape
			for (const move of [
				{ dx: 1, dz: 2 }, { dx: 2, dz: 1 },
				{ dx: -1, dz: 2 }, { dx: -2, dz: 1 },
				{ dx: 1, dz: -2 }, { dx: 2, dz: -1 },
				{ dx: -1, dz: -2 }, { dx: -2, dz: -1 }
			]) {
				const newX = piece.x + move.dx;
				const newZ = piece.z + move.dz;
				
				if (isValidPosition(newX, newZ) && !isFriendlyOccupied(newX, newZ, piece.player)) {
					validMoves.push({ x: newX, z: newZ });
				}
			}
			break;
			
		case 'bishop':
			// Bishops move diagonally
			addLinearMoves(piece, validMoves, [
				{ dx: 1, dz: 1 },
				{ dx: 1, dz: -1 },
				{ dx: -1, dz: 1 },
				{ dx: -1, dz: -1 }
			]);
			break;
			
		case 'queen':
			// Queens move like rooks and bishops combined
			addLinearMoves(piece, validMoves, [
				{ dx: 1, dz: 0 },
				{ dx: -1, dz: 0 },
				{ dx: 0, dz: 1 },
				{ dx: 0, dz: -1 },
				{ dx: 1, dz: 1 },
				{ dx: 1, dz: -1 },
				{ dx: -1, dz: 1 },
				{ dx: -1, dz: -1 }
			]);
			break;
			
		case 'king':
			// Kings move one square in any direction
			for (const dz of [-1, 0, 1]) {
				for (const dx of [-1, 0, 1]) {
					if (dx === 0 && dz === 0) continue; // Skip current position
					
					const newX = piece.x + dx;
					const newZ = piece.z + dz;
					
					if (isValidPosition(newX, newZ) && !isFriendlyOccupied(newX, newZ, piece.player)) {
						validMoves.push({ x: newX, z: newZ });
					}
				}
			}
			break;
	}
	
	return validMoves;
}

/**
 * Add linear moves in specified directions until blocked
 * @param {Object} piece - Chess piece
 * @param {Array} moves - Array to add valid moves to
 * @param {Array} directions - Array of direction vectors
 */
function addLinearMoves(piece, moves, directions) {
	for (const dir of directions) {
		let distance = 1;
		
		while (true) {
			const newX = piece.x + dir.dx * distance;
			const newZ = piece.z + dir.dz * distance;
			
			// Stop if position is invalid or occupied by friendly piece
			if (!isValidPosition(newX, newZ) || isFriendlyOccupied(newX, newZ, piece.player)) {
				break;
			}
			
			// Add this move
			moves.push({ x: newX, z: newZ });
			
			// Stop if occupied by enemy piece
			if (isEnemyOccupied(newX, newZ, piece.player)) {
				break;
			}
			
			distance++;
		}
	}
}

/**
 * Check if a position is valid (within board bounds and has a cell)
 * @param {number} x - X position
 * @param {number} z - Z position
 * @returns {boolean} - Whether the position is valid
 */
function isValidPosition(x, z) {
	// First check if within board bounds
	if (x < 0 || x >= gameState.boardSize || z < 0 || z >= gameState.boardSize) {
		return false;
	}
	
	// For chess pieces, a position is only valid if it has a cell
	// Chess pieces should NOT be able to move to empty spaces or positions adjacent to home zones
	return gameState.board[z][x] !== 0; // Must have a cell
}

/**
 * Check if a position is occupied by any chess piece
 * @param {number} x - X position
 * @param {number} z - Z position
 * @returns {boolean} - Whether the position is occupied
 */
function isOccupied(x, z) {
	return gameState.chessPieces.some(piece => piece.x === x && piece.z === z);
}

/**
 * Check if a position is occupied by a friendly chess piece
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} player - Player number
 * @returns {boolean} - Whether the position is occupied by a friendly piece
 */
function isFriendlyOccupied(x, z, player) {
	return gameState.chessPieces.some(piece => piece.x === x && piece.z === z && piece.player === player);
}

/**
 * Check if a position is occupied by an enemy chess piece
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {number} player - Player number
 * @returns {boolean} - Whether the position is occupied by an enemy piece
 */
function isEnemyOccupied(x, z, player) {
	return gameState.chessPieces.some(piece => piece.x === x && piece.z === z && piece.player !== player);
}

/**
 * Handle chess piece selection and movement
 * @param {number} x - Target X position
 * @param {number} z - Target Z position
 */
function handleChessMove(x, z) {
	// If no piece is selected, try to select a piece at this position
	if (!gameState.selectedChessPiece) {
		// Check if there's a chess piece at this position
		const piece = gameState.chessPieces.find(p => 
			p.x === x && p.z === z && p.player === gameState.currentPlayer);
		
		if (piece) {
			// Select the piece
			gameState.selectedChessPiece = piece;
			console.log(`Selected piece: ${piece.type} at ${piece.x}, ${piece.z}`);
			
			// Highlight the selected piece
			highlightSelectedPiece(piece);
			
			// Show valid moves
			showValidMoves(true);
		}
		return;
	}
	
	// If a piece is already selected, try to move it
	const selectedPiece = gameState.selectedChessPiece;
	
	// Check if trying to select another piece of the same player
	const samePlayerPiece = gameState.chessPieces.find(p => 
		p.x === x && p.z === z && p.player === gameState.currentPlayer);
		
	if (samePlayerPiece) {
		// Deselect current piece
		gameState.selectedChessPiece = null;
		showValidMoves(false);
		
		// Select the new piece instead
		handleChessMove(x, z);
		return;
	}
	
	// Check if the move is valid
	const validMoves = getValidMoves(selectedPiece);
	const isValidMove = validMoves.some(move => move.x === x && move.z === z);
	
	if (!isValidMove) {
		console.log(`Invalid move from ${selectedPiece.x},${selectedPiece.z} to ${x},${z}`);
		return;
	}
	
	// Check if there's an enemy piece at the target position
	const capturedPiece = gameState.chessPieces.find(p => 
		p.x === x && p.z === z && p.player !== gameState.currentPlayer);
	
	// Store move information
	const moveData = {
		piece: selectedPiece.type,
		player: selectedPiece.player,
		from: { x: selectedPiece.x, z: selectedPiece.z },
		to: { x, z },
		chessPieces: gameState.chessPieces // Include the full chess pieces array
	};
	
	// If capturing a piece
	if (capturedPiece) {
		console.log(`Capturing ${capturedPiece.type} at ${x},${z}`);
		
		// Include captured piece info in move data
		moveData.captured = {
			type: capturedPiece.type,
			player: capturedPiece.player
		};
		
		// Remove the captured piece
		const capturedPieceIndex = gameState.chessPieces.findIndex(p => p === capturedPiece);
		if (capturedPieceIndex !== -1) {
			// Check if king was captured (game over)
			if (capturedPiece.type === 'king') {
				gameState.isGameOver = true;
				gameState.winner = gameState.currentPlayer;
				console.log(`Player ${gameState.currentPlayer} wins!`);
			}
			
			gameState.chessPieces.splice(capturedPieceIndex, 1);
		}
	}
	
	// Move the selected piece
	selectedPiece.x = x;
	selectedPiece.z = z;
	
	// Hide valid moves
	showValidMoves(false);
	
	// Update chess pieces visualization
	updateChessPieces();
	
	// Update moveData with the modified chess pieces array
	moveData.chessPieces = gameState.chessPieces;
	
	// Send chess move to server
	sendChessMoveToServer(moveData);
	
	// Deselect the piece
	gameState.selectedChessPiece = null;
	
	// Move to next turn phase if the game is not over
	if (!gameState.isGameOver) {
		gameState.turnPhase = 'tetris';
		
		// Create new tetromino for next turn
		createNewTetromino();
		
		console.log(`Turn phase changed to: ${gameState.turnPhase}`);
		updateGameStatusDisplay();
	} else {
		// Show game over message
		showToastMessage(`Game over! Player ${gameState.winner} wins!`);
		updateGameStatusDisplay();
	}
}

/**
 * Send chess move to server
 * @param {Object} moveData - Data about the chess move
 */
function sendChessMoveToServer(moveData) {
	// Add current player and timestamp
	const fullMoveData = {
		...moveData,
		player: gameState.currentPlayer,
		timestamp: Date.now()
	};
	
	// Submit to server using NetworkManager
	NetworkManager.sendMessage('chess_move', fullMoveData);
	
	console.log('Sent chess move to server:', fullMoveData);
}

/**
 * Update chess pieces visualization
 */
function updateChessPieces() {
	// Clear existing chess pieces
	while (chessPiecesGroup.children.length > 0) {
		chessPiecesGroup.remove(chessPiecesGroup.children[0]);
	}
	
	// Offset for centering board
	const offsetX = gameState.boardSize / 2 - 0.5;
	const offsetZ = gameState.boardSize / 2 - 0.5;
	
	// Render chess pieces
	for (let i = 0; i < gameState.chessPieces.length; i++) {
		const piece = gameState.chessPieces[i];
		
		// Get piece color
		const color = getCellColor(piece.player === 1 ? 6 : 7);
		
		// Check the height of the cell at the piece's position
		// Count how many blocks are stacked at this position
		let cellHeight = 0;
		if (isValidPosition(piece.x, piece.z)) {
			// For simplicity, just check if there's a non-zero value at position
			if (gameState.board[piece.z][piece.x] !== 0) {
				cellHeight = 1; // Each cell is 1 unit high
			}
		}
		
		// Base height of the piece - place on top of cells
		const baseHeight = cellHeight;
		
		// Create piece geometry based on type
		let geometry;
		let height = baseHeight;
		
		switch (piece.type) {
			case 'pawn':
				geometry = new THREE.ConeGeometry(0.3, 0.8, 8);
				height = baseHeight + 0.5;
				break;
				
			case 'rook':
				geometry = new THREE.BoxGeometry(0.5, 0.9, 0.5);
				height = baseHeight + 0.6;
				break;
				
			case 'knight':
				// L-shaped geometry for knight
				const knightGroup = new THREE.Group();
				
				const baseGeom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
				const baseMesh = new THREE.Mesh(
					baseGeom,
					new THREE.MeshStandardMaterial({ color })
				);
				baseMesh.position.y = 0.25;
				knightGroup.add(baseMesh);
				
				const topGeom = new THREE.BoxGeometry(0.3, 0.5, 0.3);
				const topMesh = new THREE.Mesh(
					topGeom,
					new THREE.MeshStandardMaterial({ color })
				);
				topMesh.position.set(0.1, 0.75, 0);
				knightGroup.add(topMesh);
				
				knightGroup.rotation.y = piece.player === 1 ? 0 : Math.PI;
				chessPiecesGroup.add(knightGroup);
				
				// Position the group on top of the cell
				knightGroup.position.set(
					piece.x - offsetX,
					baseHeight,
					piece.z - offsetZ
				);
				
				// Store piece index in the group's userData
				knightGroup.userData = { pieceIndex: i };
				
				knightGroup.castShadow = true;
				knightGroup.receiveShadow = true;
				
				// Skip the standard piece creation for knight
				continue;
				
			case 'bishop':
				geometry = new THREE.ConeGeometry(0.3, 1.0, 8);
				height = baseHeight + 0.7;
				break;
				
			case 'queen':
				geometry = new THREE.CylinderGeometry(0.2, 0.4, 1.1, 8);
				height = baseHeight + 0.8;
				break;
				
			case 'king':
				const kingGroup = new THREE.Group();
				
				// Base
				const kingBase = new THREE.Mesh(
					new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8),
					new THREE.MeshStandardMaterial({ color })
				);
				kingBase.position.y = 0.4;
				kingGroup.add(kingBase);
				
				// Cross on top
				const crossVert = new THREE.Mesh(
					new THREE.BoxGeometry(0.1, 0.5, 0.1),
					new THREE.MeshStandardMaterial({ color })
				);
				crossVert.position.y = 1.0;
				kingGroup.add(crossVert);
				
				const crossHoriz = new THREE.Mesh(
					new THREE.BoxGeometry(0.3, 0.1, 0.1),
					new THREE.MeshStandardMaterial({ color })
				);
				crossHoriz.position.y = 0.9;
				kingGroup.add(crossHoriz);
				
				chessPiecesGroup.add(kingGroup);
				
				// Position the group on top of the cell
				kingGroup.position.set(
					piece.x - offsetX,
					baseHeight,
					piece.z - offsetZ
				);
				
				// Store piece index in the group's userData
				kingGroup.userData = { pieceIndex: i };
				
				kingGroup.castShadow = true;
				kingGroup.receiveShadow = true;
				
				// Skip the standard piece creation for king
				continue;
				
			default:
				// Default simple box
				geometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
				height = baseHeight + 0.4;
		}
		
		// Create material
		const material = new THREE.MeshStandardMaterial({
			color,
			roughness: 0.7,
			metalness: 0.3
		});
		
		// Create mesh
		const pieceMesh = new THREE.Mesh(geometry, material);
		pieceMesh.position.set(
			piece.x - offsetX,
			height / 2, // Position based on height
			piece.z - offsetZ
		);
		
		// Store piece index in the mesh's userData
		pieceMesh.userData = { pieceIndex: i };
		
		pieceMesh.castShadow = true;
		pieceMesh.receiveShadow = true;
		chessPiecesGroup.add(pieceMesh);
	}
}

/**
 * Create game status display
 */
function createGameStatusDisplay() {
	// Create or get status container
	let statusContainer = document.getElementById('game-status');
	if (!statusContainer) {
		statusContainer = document.createElement('div');
		statusContainer.id = 'game-status';
		
		// Style the container
		Object.assign(statusContainer.style, {
			position: 'fixed',
			top: '10px',
			right: '10px',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			color: 'white',
			padding: '15px',
			borderRadius: '5px',
			fontFamily: 'Arial',
			fontSize: '16px',
			zIndex: '100',
			minWidth: '220px',
			textAlign: 'center'
		});
		
		document.body.appendChild(statusContainer);
	}
	
	// Create or get controls container for debug options
	let controlsContainer = document.getElementById('debug-controls');
	if (!controlsContainer) {
		controlsContainer = document.createElement('div');
		controlsContainer.id = 'debug-controls';
		
		// Style the container
		Object.assign(controlsContainer.style, {
			position: 'fixed',
			top: '200px',
			right: '10px',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			color: 'white',
			padding: '10px',
			borderRadius: '5px',
			fontFamily: 'Arial',
			fontSize: '14px',
			zIndex: '100',
			minWidth: '150px'
		});
		
		// Add debug controls
		controlsContainer.innerHTML = `
			<div style="text-align: center; margin-bottom: 10px; font-weight: bold;">Debug Controls</div>
			<div style="margin-bottom: 10px;">
				<button id="debug-tetris-phase" style="margin-right: 5px;">Tetris Phase</button>
				<button id="debug-chess-phase">Chess Phase</button>
			</div>
			<div style="margin-bottom: 10px;">
				<button id="debug-player1" style="margin-right: 5px;">Player 1</button>
				<button id="debug-player2">Player 2</button>
			</div>
			<div>
				<button id="debug-new-tetromino" style="width: 100%;">New Tetromino</button>
			</div>
			<div style="margin-top: 10px;">
				<button id="debug-new-cycle" style="width: 100%;">Start New Cycle</button>
			</div>
		`;
		
		document.body.appendChild(controlsContainer);
		
		// Add event listeners for debug controls
		document.getElementById('debug-tetris-phase').addEventListener('click', () => {
			gameState.turnPhase = 'tetris';
			// Create a new tetromino if none exists
			if (!gameState.currentTetromino) {
				createNewTetromino();
			}
			updateGameStatusDisplay();
		});
		
		document.getElementById('debug-chess-phase').addEventListener('click', () => {
			gameState.turnPhase = 'chess';
			updateGameStatusDisplay();
		});
		
		document.getElementById('debug-player1').addEventListener('click', () => {
			gameState.currentPlayer = 1;
			updateGameStatusDisplay();
		});
		
		document.getElementById('debug-player2').addEventListener('click', () => {
			gameState.currentPlayer = 2;
			updateGameStatusDisplay();
		});
		
		document.getElementById('debug-new-tetromino').addEventListener('click', () => {
			createNewTetromino();
		});
		
		document.getElementById('debug-new-cycle').addEventListener('click', () => {
			exportedFunctions.startNewCycle();
		});
	}
	
	// Initial update
	updateGameStatusDisplay();
}

/**
 * Update game status display
 */
function updateGameStatusDisplay() {
	// Create or get game status display
	let statusDisplay = document.getElementById('game-status');
	
	// If no status display exists, create one
	if (!statusDisplay) {
		statusDisplay = document.createElement('div');
		statusDisplay.id = 'game-status';
		
		// Style the status display
		Object.assign(statusDisplay.style, {
			position: 'fixed',
			bottom: '10px',
			left: '50%',
			transform: 'translateX(-50%)',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			color: 'white',
			padding: '10px 20px',
			borderRadius: '5px',
			fontFamily: 'Arial, sans-serif',
			zIndex: '1000',
			textAlign: 'center',
			fontSize: '16px'
		});
		
		document.body.appendChild(statusDisplay);
	}
	
	// Update status based on game state
	if (gameState.isGameOver) {
		statusDisplay.innerHTML = `
			<div style="color: #FFD700;">Game Over</div>
			<div>Player ${gameState.winner} wins!</div>
		`;
		statusDisplay.style.backgroundColor = 'rgba(128, 0, 0, 0.8)';
	} else if (!gameState.currentPlayer) {
		statusDisplay.textContent = 'Waiting for game to start...';
	} else {
		let phase = gameState.turnPhase === 'tetris' ? 'Place Tetromino' : 'Move Chess Piece';
		let playerColor = gameState.currentPlayer === 1 ? '#4477FF' : '#FF7744';
		
		statusDisplay.innerHTML = `
			<div>
				Player ${gameState.currentPlayer} - 
				<span style="color: ${playerColor};">${phase}</span>
			</div>
		`;
		
		// Highlight if it's the current turn
		if (NetworkManager.getPlayerId() === `player${gameState.currentPlayer}`) {
			statusDisplay.style.backgroundColor = 'rgba(0, 128, 0, 0.8)';
		} else {
			statusDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		}
	}
}

/**
 * Restart the game
 */
function restartGame() {
	console.log('Restarting game...');
	
	// Clear existing tetromino
	if (gameState.currentTetromino) {
		const tetrominoGroup = scene.getObjectByName('activeTetromino');
		if (tetrominoGroup) {
			scene.remove(tetrominoGroup);
		}
		
		const ghostGroup = scene.getObjectByName('ghostPiece');
		if (ghostGroup) {
			scene.remove(ghostGroup);
		}
		
		gameState.currentTetromino = null;
		gameState.ghostPiece = null;
	}
	
	// Clear chess pieces
	const chessPiecesGroup = scene.getObjectByName('chessPieces');
	if (!chessPiecesGroup) return;
	
	while (chessPiecesGroup.children.length > 0) {
		chessPiecesGroup.remove(chessPiecesGroup.children[0]);
	}
	
	// Clear move indicators if any
	const moveIndicators = scene.getObjectByName('moveIndicators');
	if (moveIndicators) {
		scene.remove(moveIndicators);
	}
	
	// Reset game state
	resetGameState();
	
	// Recreate board
	createBoard();
	
	// Request new game state from server
	if (NetworkManager && NetworkManager.isConnected()) {
		// Request new game from server
		NetworkManager.sendMessage('restart_game', {
			gameId: NetworkManager.getGameId()
		});
		
		// Request fresh game state
		NetworkManager.sendMessage('get_game_state', { 
			gameId: NetworkManager.getGameId() 
		});
		
		showToastMessage('Game restarted - requesting new game state from server');
	} else {
		// Offline mode fallback
		gameState.board = createLocalBoard();
		gameState.chessPieces = createLocalChessPieces();
		gameState.currentPlayer = 1;
		gameState.turnPhase = 'tetris';
		createBoard();
		updateChessPieces();
		createNewTetromino();
		
		showToastMessage('Game restarted in offline mode');
	}
	
	// Reset camera
	resetCamera(true);
	
	console.log('Game restarted');
}

/**
 * Export functions for external use
 */
export const exportedFunctions = {
	resetCamera: resetCameraView,
	restartGame,
	forceRedraw: function() {
		// Clear existing visual elements
		while (boardGroup.children.length > 0) {
			boardGroup.remove(boardGroup.children[0]);
		}
		
		while (tetrominoGroup.children.length > 0) {
			tetrominoGroup.remove(tetrominoGroup.children[0]);
		}
		
		while (chessPiecesGroup.children.length > 0) {
			chessPiecesGroup.remove(chessPiecesGroup.children[0]);
		}
		
		// Rebuild all visual elements
		createBoard();
		updateChessPieces();
		updateTetrominoVisuals();
		
		// Ensure valid moves are shown if a piece is selected
		if (gameState.selectedChessPiece) {
			showValidMoves(true);
		}
		
		// Update game status
		updateGameStatusDisplay();
	},
	placeTetromino,
	createNewTetromino,
	updateTetrominoVisuals,
	updateChessPieces,
	showValidMoves,
	handleChessMove,
	// Start a new cycle for the current player (not a "next turn" between players)
	startNewCycle: function() {
		// Clear any existing fall interval
		if (gameState.fallInterval) {
			clearInterval(gameState.fallInterval);
			gameState.fallInterval = null;
		}
		
		// Start with tetris phase
		gameState.turnPhase = 'tetris';
		
		// Create new tetromino for this player
		createNewTetromino();
		
		// Show notification
		showToastMessage(`Starting new round for Player ${gameState.currentPlayer}`);
		
		// Update display
		updateGameStatusDisplay();
	}
};

/**
 * Show a tutorial message
 */
function showTutorialMessage() {
	// Create tutorial message
	const tutorialElement = document.createElement('div');
	tutorialElement.id = 'tutorial-message';
	
	// Style the container
	Object.assign(tutorialElement.style, {
		position: 'fixed',
		top: '50%',
		left: '50%',
		transform: 'translate(-50%, -50%)',
		backgroundColor: 'rgba(0, 0, 0, 0.9)',
		color: 'white',
		padding: '20px',
		borderRadius: '10px',
		fontFamily: 'Arial',
		fontSize: '16px',
		zIndex: '1000',
		maxWidth: '80%',
		textAlign: 'center',
		border: '2px solid #3498db',
		boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)'
	});
	
	// Add content
	tutorialElement.innerHTML = `
		<h2 style="color: #3498db; margin-top: 0;">Welcome to Shaktris!</h2>
		<p>A massively multiplayer game combining Chess and Tetris</p>
		
		<div style="text-align: left; margin: 15px 0;">
			<h3 style="color: #3498db;">How to Play:</h3>
			<ul style="line-height: 1.5;">
				<li><strong>All Players Play Simultaneously</strong> - There are no turns between players!</li>
				<li><strong>Player Cycle:</strong> Each player follows their own cycle:
					<ol>
						<li>First, place a Tetromino (pieces now fall vertically from above)</li>
						<li>Then, move one of your chess pieces</li>
						<li>Repeat - each player plays at their own pace</li>
					</ol>
				</li>
				<li><strong>Tetris Phase:</strong> Tetris pieces automatically fall from above
					<ul>
						<li>Arrow keys: Move tetromino horizontally/vertically on the board</li>
						<li>Z/X: Rotate tetromino</li>
						<li>Space: Hard drop tetromino</li>
						<li>Pieces will explode if they collide with existing blocks!</li>
					</ul>
				</li>
				<li><strong>Chess Phase:</strong> After placing your tetromino
					<ul>
						<li>Click on your piece to select it</li>
						<li>Green circles show where you can move</li>
						<li>Click on a green circle to move there</li>
						<li>After moving, your chess phase ends and you start a new tetris phase</li>
					</ul>
				</li>
				<li><strong>Objective:</strong> Capture opponent kings!</li>
			</ul>
		</div>
		
		<p style="font-style: italic; margin-top: 10px;">This is a massively multiplayer game where all players play independently at the same time.</p>
		
		<button id="tutorial-close" style="padding: 8px 20px; background-color: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; margin-top: 15px;">Start Playing</button>
	`;
	
	// Add to body
	document.body.appendChild(tutorialElement);
	
	// Add event listener to close button
	document.getElementById('tutorial-close').addEventListener('click', () => {
		document.body.removeChild(tutorialElement);
	});
}

/**
 * Highlight the selected chess piece
 * @param {Object} piece - Chess piece to highlight
 */
function highlightSelectedPiece(piece) {
	// Remove any existing highlight
	const existingHighlight = scene.getObjectByName('pieceHighlight');
	if (existingHighlight) {
		scene.remove(existingHighlight);
	}
	
	// Create a highlight indicator
	const highlightGeometry = new THREE.RingGeometry(0.6, 0.7, 16);
	const highlightMaterial = new THREE.MeshBasicMaterial({
		color: 0xffff00,
		side: THREE.DoubleSide,
		transparent: true,
		opacity: 0.7
	});
	
	const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
	highlight.name = 'pieceHighlight';
	highlight.rotation.x = Math.PI / 2; // Lie flat
	
	// Position at piece location
	const offsetX = gameState.boardSize / 2 - 0.5;
	const offsetZ = gameState.boardSize / 2 - 0.5;
	
	// Check if the piece is on a cell (get the height)
	let cellHeight = 0;
	if (isValidPosition(piece.x, piece.z)) {
		// For simplicity, each cell is 1 unit high
		cellHeight = 1;
	}
	
	highlight.position.set(
		piece.x - offsetX,
		cellHeight + 0.1, // Position just above the cell
		piece.z - offsetZ
	);
	
	// Add animation
	const animate = () => {
		if (highlight.parent) {
			highlight.rotation.z += 0.02;
			requestAnimationFrame(animate);
		}
	};
	
	scene.add(highlight);
	animate();
}

/**
 * Show toast message on screen
 * @param {string} message - Message to display
 */
function showToastMessage(message) {
	// Create or get toast element
	let toast = document.getElementById('toast-message');
	if (!toast) {
		toast = document.createElement('div');
		toast.id = 'toast-message';
		toast.style.position = 'fixed';
		toast.style.bottom = '100px';
		toast.style.left = '50%';
		toast.style.transform = 'translateX(-50%)';
		toast.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
		toast.style.color = '#ffffff';
		toast.style.padding = '12px 20px';
		toast.style.borderRadius = '5px';
		toast.style.fontFamily = 'Arial';
		toast.style.fontSize = '16px';
		toast.style.zIndex = '1001';
		toast.style.transition = 'opacity 0.3s';
		document.body.appendChild(toast);
	}
	
	// Display message
	toast.textContent = message;
	toast.style.opacity = '1';
	
	// Hide after 3 seconds
	setTimeout(() => {
		toast.style.opacity = '0';
	}, 3000);
}

/**
 * Show visual feedback for tetromino actions
 * @param {string} key - The key that was pressed
 */
function showActionFeedback(key) {
	if (!gameState.currentTetromino) return;
	
	// Create or get action feedback element
	let indicator = document.getElementById('action-indicator');
	if (!indicator) {
		indicator = document.createElement('div');
		indicator.id = 'action-indicator';
		
		// Style the container
		Object.assign(indicator.style, {
			position: 'fixed',
			top: '50%',
			left: '50%',
			transform: 'translate(-50%, -50%)',
			backgroundColor: 'transparent',
			color: 'white',
			fontSize: '48px',
			zIndex: '999',
			pointerEvents: 'none',
			opacity: '0.7',
			transition: 'opacity 0.3s'
		});
		
		document.body.appendChild(indicator);
	}
	
	// Set content based on key
	let content = '';
	switch (key) {
		case 'ArrowLeft':
			content = '←';
			break;
		case 'ArrowRight':
			content = '→';
			break;
		case 'ArrowDown':
			content = '↓';
			break;
		case 'ArrowUp':
			content = '↑';
			break;
		case 'z':
		case 'Z':
			content = '↺';
			break;
		case 'x':
		case 'X':
			content = '↻';
			break;
		case ' ':
			content = '⤓';
			break;
	}
	
	indicator.textContent = content;
	indicator.style.opacity = '0.7';
	
	// Fade out
	setTimeout(() => {
		indicator.style.opacity = '0';
	}, 500);
}

/**
 * Export the camera for external use
 * @returns {THREE.Camera} The main camera
 */
export function getCamera() {
	return camera;
}

/**
 * Show explosion animation when tetromino collides
 * @param {number} posX - X position of the explosion
 * @param {number} posZ - Z position of the explosion
 */
function showExplosionAnimation(posX, posZ) {
	// Offset for centering board
	const offsetX = gameState.boardSize / 2 - 0.5;
	const offsetZ = gameState.boardSize / 2 - 0.5;
	
	// Create explosion particles
	const explosionGroup = new THREE.Group();
	explosionGroup.name = 'explosion';
	
	// Create 30 particles
	for (let i = 0; i < 30; i++) {
		const particleGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
		const particleMaterial = new THREE.MeshStandardMaterial({
			color: 0xff4500,
			emissive: 0xff8c00,
			emissiveIntensity: 0.5
		});
		
		const particle = new THREE.Mesh(particleGeometry, particleMaterial);
		
		// Random position within the tetromino bounds
		particle.position.set(
			(posX + Math.random() * 3 - 1.5) - offsetX,
			1 + Math.random() * 2,
			(posZ + Math.random() * 3 - 1.5) - offsetZ
		);
		
		// Random velocity
		particle.userData.velocity = {
			x: Math.random() * 0.3 - 0.15,
			y: Math.random() * 0.2 + 0.1,
			z: Math.random() * 0.3 - 0.15
		};
		
		explosionGroup.add(particle);
	}
	
	scene.add(explosionGroup);
	
	// Animate the explosion
	let explosionFrame = 0;
	const maxFrames = 30;
	
	function animateExplosion() {
		explosionFrame++;
		
		// Update particle positions based on velocity
		explosionGroup.children.forEach(particle => {
			particle.position.x += particle.userData.velocity.x;
			particle.position.y += particle.userData.velocity.y;
			particle.position.z += particle.userData.velocity.z;
			
			// Add gravity
			particle.userData.velocity.y -= 0.01;
			
			// Fade out
			if (particle.material.opacity !== undefined) {
				particle.material.opacity = 1 - (explosionFrame / maxFrames);
			}
		});
		
		// Continue animation until max frames reached
		if (explosionFrame < maxFrames) {
			requestAnimationFrame(animateExplosion);
		} else {
			// Remove explosion group
			scene.remove(explosionGroup);
		}
	}
	
	// Start animation
	animateExplosion();
	
	// Add a visual toast message
	showToastMessage("BOOM! Tetromino exploded!");
}

/**
 * Create network status display
 */
function createNetworkStatusDisplay() {
	// Create network status indicator
	const statusElement = document.createElement('div');
	statusElement.id = 'network-status';
	
	// Style the element
	Object.assign(statusElement.style, {
		position: 'fixed',
		bottom: '10px',
		right: '10px',
		backgroundColor: 'rgba(0, 0, 0, 0.7)',
		color: '#ffffff',
		padding: '8px 12px',
		borderRadius: '5px',
		fontFamily: 'Arial',
		fontSize: '12px',
		zIndex: '1001',
		display: 'flex',
		alignItems: 'center',
		gap: '8px'
	});
	
	statusElement.innerHTML = `
		<div id="connection-indicator" style="width: 10px; height: 10px; border-radius: 50%; background-color: #777;"></div>
		<span id="connection-text">Connecting...</span>
	`;
	
	document.body.appendChild(statusElement);
	
	// Update initial status
	updateNetworkStatus(NetworkManager.getStatus());
}

/**
 * Update network status display
 * @param {string} status - Connection status
 */
function updateNetworkStatus(status) {
	const indicator = document.getElementById('connection-indicator');
	const text = document.getElementById('connection-text');
	
	if (!indicator || !text) return;
	
	switch (status) {
		case 'connected':
			indicator.style.backgroundColor = '#00cc00'; // Green
			text.textContent = 'Connected';
			break;
		case 'connecting':
			indicator.style.backgroundColor = '#ffaa00'; // Orange
			text.textContent = 'Connecting...';
			break;
		case 'disconnected':
			indicator.style.backgroundColor = '#cc0000'; // Red
			text.textContent = 'Disconnected';
			break;
		case 'failed':
			indicator.style.backgroundColor = '#cc0000'; // Red
			text.textContent = 'Connection Failed';
			break;
		default:
			indicator.style.backgroundColor = '#777777'; // Gray
			text.textContent = 'Unknown Status';
	}
}

/**
 * Set up network event listeners
 */
function setupNetworkEvents() {
	// Listen for connection status changes
	NetworkManager.addEventListener('connect', () => {
		updateNetworkStatus('connected');
		
		// When connected, request current game state
		const gameId = NetworkManager.getGameId();
		if (gameId) {
			console.log('Requesting game state for game:', gameId);
			NetworkManager.sendMessage('get_game_state', { gameId });
		} else {
			console.warn('No game ID available, cannot request game state');
		}
	});
	
	NetworkManager.addEventListener('disconnect', () => {
		updateNetworkStatus('disconnected');
		showToastMessage('Disconnected from server. Attempting to reconnect...');
	});
	
	NetworkManager.addEventListener('error', (error) => {
		updateNetworkStatus('failed');
		console.error('Network error:', error);
		showToastMessage('Connection error. Check your network connection.');
	});
	
	// Listen for game updates
	NetworkManager.onMessage('game_update', (message) => {
		console.log('Game state update received:', message);
		
		// Update game ID display
		updateGameIdDisplay(NetworkManager.getGameId());
		
		// Update game state from server data if available
		if (message.gameState) {
			updateGameStateFromServer(message.gameState);
		}
	});
	
	// Listen for complete game state
	NetworkManager.onMessage('game_state', (message) => {
		console.log('Complete game state received:', message);
		
		if (message.state) {
			// Replace entire game state with server data
			updateCompleteGameState(message.state);
		}
	});
	
	// Listen for tetromino placements from other players
	NetworkManager.onMessage('tetromino_placed', (message) => {
		// Only process if it's not from the current player
		if (message.playerId !== NetworkManager.getPlayerId()) {
			console.log('Received tetromino placement from other player:', message);
			
			// Add the tetromino to the board
			applyTetrominoPlacement(message.tetromino || message);
		}
	});
	
	// Listen for chess moves from other players
	NetworkManager.onMessage('chess_move', (message) => {
		// Only process if it's not from the current player
		if (message.playerId !== NetworkManager.getPlayerId()) {
			console.log('Received chess move from other player:', message);
			
			// Apply the chess move
			applyChessMove(message.move || message);
		}
	});
	
	// Listen for player joined events
	NetworkManager.onMessage('player_joined', (message) => {
		console.log('Player joined:', message);
		showToastMessage(`${message.playerName} joined the game`);
		
		// Update player list if available
		if (message.players) {
			updatePlayerList(message.players);
		}
	});
	
	// Listen for player left events
	NetworkManager.onMessage('player_left', (message) => {
		console.log('Player left:', message);
		showToastMessage(`${message.playerName} left the game`);
	});
	
	// Listen for game over events
	NetworkManager.onMessage('game_over', (message) => {
		console.log('Game over:', message);
		gameState.isGameOver = true;
		gameState.winner = message.winner;
		updateGameStatusDisplay();
		showToastMessage(`Game over! Player ${message.winner} wins!`);
	});
	
	// Listen for error events
	NetworkManager.onMessage('error', (message) => {
		console.error('Server error:', message);
		showToastMessage(`Server error: ${message.message || 'Unknown error'}`);
	});
	
	// Update game ID display with current game ID
	updateGameIdDisplay(NetworkManager.getGameId());
	
	// Check for status changes periodically
	setInterval(() => {
		updateNetworkStatus(NetworkManager.getStatus());
	}, 2000);
}

/**
 * Apply a tetromino placement from another player
 * @param {Object} tetromino - Tetromino data
 */
function applyTetrominoPlacement(tetromino) {
	if (tetromino.exploded) {
		// Just show an explosion animation at the position
		showExplosionAnimation(tetromino.position.x, tetromino.position.z);
		return;
	}
	
	// Add tetromino blocks to the board
	const shape = tetromino.shape;
	const posX = tetromino.position.x;
	const posZ = tetromino.position.z;
	const color = tetromino.player === 1 ? 1 : 2; // Use player color
	
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// Make sure we're within board bounds
				if (boardX >= 0 && boardX < gameState.boardSize && 
					boardZ >= 0 && boardZ < gameState.boardSize) {
					gameState.board[boardZ][boardX] = color;
				}
			}
		}
	}
	
	// Check for completed rows
	checkCompletedRows();
	
	// Recreate the board visualization
	createBoard();
	
	// Show a notification
	showToastMessage(`Player ${tetromino.player} placed a tetromino`);
}

/**
 * Apply a chess move from another player
 * @param {Object} move - Chess move data
 */
function applyChessMove(move) {
	// Find the piece at the source position
	const pieceIndex = gameState.chessPieces.findIndex(p => 
		p.x === move.from.x && p.z === move.from.z && p.type === move.piece && p.player === move.player
	);
	
	if (pieceIndex !== -1) {
		// Check if this move involves a capture
		if (move.captured) {
			// Find and remove the captured piece
			const capturedIndex = gameState.chessPieces.findIndex(p => 
				p.x === move.to.x && p.z === move.to.z && 
				p.type === move.captured.type && 
				p.player === move.captured.player
			);
			
			if (capturedIndex !== -1) {
				// Check if king was captured (game over)
				if (gameState.chessPieces[capturedIndex].type === 'king') {
					gameState.isGameOver = true;
					gameState.winner = move.player;
					console.log(`Player ${move.player} wins!`);
					showToastMessage(`Player ${move.player} wins by capturing the king!`);
				}
				
				gameState.chessPieces.splice(capturedIndex, 1);
			}
		}
		
		// Move the piece to the destination
		gameState.chessPieces[pieceIndex].x = move.to.x;
		gameState.chessPieces[pieceIndex].z = move.to.z;
		
		// Update the chess pieces visualization
		updateChessPieces();
		
		// Show a notification
		if (move.captured) {
			showToastMessage(`Player ${move.player} moved ${move.piece} and captured ${move.captured.type}`);
		} else {
			showToastMessage(`Player ${move.player} moved ${move.piece}`);
		}
	}
}

/**
 * Update game ID display in the UI
 * @param {string} gameId - Game ID to display
 * @param {boolean} updateUrl - Whether to update the URL (optional)
 */
function updateGameIdDisplay(gameId, updateUrl = false) {
	// Create or get game ID display element
	let gameIdDisplay = document.getElementById('game-id-display');
	
	if (!gameIdDisplay) {
		// Create a game ID display element
		const container = document.createElement('div');
		container.style.position = 'fixed';
		container.style.bottom = '50px';
		container.style.right = '10px';
		container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
		container.style.color = 'white';
		container.style.padding = '8px';
		container.style.borderRadius = '5px';
		container.style.fontFamily = 'monospace';
		container.style.fontSize = '12px';
		container.style.zIndex = '1000';
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.gap = '5px';
		
		const label = document.createElement('div');
		label.textContent = 'Game ID:';
		container.appendChild(label);
		
		const idElement = document.createElement('div');
		idElement.id = 'game-id-display';
		idElement.style.fontWeight = 'bold';
		idElement.style.wordBreak = 'break-all';
		idElement.style.maxWidth = '200px';
		container.appendChild(idElement);
		
		// Add copy button
		const copyButton = document.createElement('button');
		copyButton.textContent = 'Copy Game ID';
		copyButton.style.marginTop = '5px';
		copyButton.style.padding = '3px';
		copyButton.style.cursor = 'pointer';
		copyButton.onclick = () => {
			navigator.clipboard.writeText(gameId)
				.then(() => {
					copyButton.textContent = 'Copied!';
					setTimeout(() => {
						copyButton.textContent = 'Copy Game ID';
					}, 2000);
				})
				.catch(err => {
					console.error('Failed to copy:', err);
					copyButton.textContent = 'Failed to copy';
				});
		};
		container.appendChild(copyButton);
		
		document.body.appendChild(container);
		
		gameIdDisplay = idElement;
	}
	
	// Update game ID text
	if (gameIdDisplay && gameId) {
		gameIdDisplay.textContent = gameId;
	}
	
	// Only update URL if explicitly requested
	if (updateUrl && gameId) {
		// Update URL if needed
		const currentUrl = new URL(window.location.href);
		if (!currentUrl.searchParams.has('game')) {
			currentUrl.searchParams.set('game', gameId);
			window.history.replaceState({}, '', currentUrl);
		}
	}
}

/**
 * Update the complete game state from server data
 * @param {Object} serverState - The complete game state from server
 */
function updateCompleteGameState(serverState) {
	console.log('Updating complete game state from server:', serverState);
	
	// Update board if available
	if (serverState.board) {
		gameState.board = serverState.board;
		createBoard(); // Recreate board visualization
	}
	
	// Update chess pieces if available
	if (serverState.chessPieces) {
		gameState.chessPieces = serverState.chessPieces;
		updateChessPieces(); // Update chess pieces visualization
	}
	
	// Update turn info if available
	if (serverState.currentPlayer) {
		gameState.currentPlayer = serverState.currentPlayer;
		console.log(`Current player set to ${gameState.currentPlayer}`);
	}
	
	if (serverState.turnPhase) {
		gameState.turnPhase = serverState.turnPhase;
		console.log(`Turn phase set to ${gameState.turnPhase}`);
	} else if (!gameState.turnPhase && gameState.currentPlayer) {
		// Set a default phase if none provided but we have a current player
		gameState.turnPhase = 'tetris';
		console.log(`Default turn phase set to tetris`);
	}
	
	// Set board size
	if (serverState.boardSize) {
		gameState.boardSize = serverState.boardSize;
	}
	
	// Check if game is over
	if (serverState.isGameOver) {
		gameState.isGameOver = serverState.isGameOver;
		gameState.winner = serverState.winner;
	}
	
	// Update current tetromino if needed
	if (serverState.currentTetromino && serverState.currentPlayer === gameState.currentPlayer) {
		gameState.currentTetromino = serverState.currentTetromino;
		updateGhostPiece();
		updateTetrominoVisuals();
	} else if (!gameState.currentTetromino && gameState.turnPhase === 'tetris') {
		// Create a new tetromino if we need one
		createNewTetromino();
	}
	
	// Update game status display
	updateGameStatusDisplay();
}

/**
 * Update partial game state from server updates
 * @param {Object} serverState - Partial game state from server
 */
function updateGameStateFromServer(serverState) {
	console.log('Updating partial game state from server:', serverState);
	
	// Update any fields that are present in the update
	for (const key in serverState) {
		if (key === 'board' && serverState.board) {
			gameState.board = serverState.board;
			createBoard(); // Recreate board visualization
		} else if (key === 'chessPieces' && serverState.chessPieces) {
			gameState.chessPieces = serverState.chessPieces;
			updateChessPieces(); // Update chess pieces visualization
		} else if (key in gameState) {
			gameState[key] = serverState[key];
		}
	}
	
	// Update game status display
	updateGameStatusDisplay();
}

/**
 * Create a local board for offline play
 * This is only used if server connection fails
 */
function createLocalBoard() {
	const size = 16;
	const board = Array(size).fill().map(() => Array(size).fill(0));
	
	// Set up player 1 home zone (bottom)
	for (let z = size - 2; z < size; z++) {
		for (let x = 0; x < 8; x++) {
			board[z][x] = 6; // Blue home zone
		}
	}
	
	// Set up player 2 home zone (top)
	for (let z = 0; z < 2; z++) {
		for (let x = 8; x < size; x++) {
			board[z][x] = 7; // Orange home zone
		}
	}
	
	return board;
}

/**
 * Create local chess pieces for offline play
 * This is only used if server connection fails
 */
function createLocalChessPieces() {
	// Create chess pieces
	const player1Pieces = [
		{ type: 'pawn', x: 0, z: 14 },
		{ type: 'pawn', x: 1, z: 14 },
		{ type: 'pawn', x: 2, z: 14 },
		{ type: 'pawn', x: 3, z: 14 },
		{ type: 'pawn', x: 4, z: 14 },
		{ type: 'pawn', x: 5, z: 14 },
		{ type: 'pawn', x: 6, z: 14 },
		{ type: 'pawn', x: 7, z: 14 },
		{ type: 'rook', x: 0, z: 15 },
		{ type: 'knight', x: 1, z: 15 },
		{ type: 'bishop', x: 2, z: 15 },
		{ type: 'queen', x: 3, z: 15 },
		{ type: 'king', x: 4, z: 15 },
		{ type: 'bishop', x: 5, z: 15 },
		{ type: 'knight', x: 6, z: 15 },
		{ type: 'rook', x: 7, z: 15 }
	].map(piece => ({ ...piece, player: 1 }));
	
	// Define chess piece types and positions for player 2
	const player2Pieces = [
		{ type: 'pawn', x: 8, z: 1 },
		{ type: 'pawn', x: 9, z: 1 },
		{ type: 'pawn', x: 10, z: 1 },
		{ type: 'pawn', x: 11, z: 1 },
		{ type: 'pawn', x: 12, z: 1 },
		{ type: 'pawn', x: 13, z: 1 },
		{ type: 'pawn', x: 14, z: 1 },
		{ type: 'pawn', x: 15, z: 1 },
		{ type: 'rook', x: 8, z: 0 },
		{ type: 'knight', x: 9, z: 0 },
		{ type: 'bishop', x: 10, z: 0 },
		{ type: 'queen', x: 11, z: 0 },
		{ type: 'king', x: 12, z: 0 },
		{ type: 'bishop', x: 13, z: 0 },
		{ type: 'knight', x: 14, z: 0 },
		{ type: 'rook', x: 15, z: 0 }
	].map(piece => ({ ...piece, player: 2 }));
	
	return [...player1Pieces, ...player2Pieces];
}

/**
 * Update player list
 * @param {Array} players - List of players
 */
function updatePlayerList(players) {
	// Create or get player list container
	let playerList = document.getElementById('player-list');
	
	// If no player list exists, create one
	if (!playerList) {
		const sidebarContainer = document.createElement('div');
		sidebarContainer.id = 'player-sidebar';
		
		// Style the sidebar
		Object.assign(sidebarContainer.style, {
			position: 'fixed',
			top: '10px',
			right: '10px',
			width: '180px',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			padding: '10px',
			borderRadius: '5px',
			zIndex: '1000',
			color: 'white',
			fontFamily: 'Arial, sans-serif'
		});
		
		// Add header
		const header = document.createElement('h3');
		header.textContent = 'Players';
		header.style.marginTop = '0';
		header.style.marginBottom = '10px';
		sidebarContainer.appendChild(header);
		
		// Create player list
		playerList = document.createElement('div');
		playerList.id = 'player-list';
		sidebarContainer.appendChild(playerList);
		
		// Add to document
		document.body.appendChild(sidebarContainer);
	}
	
	// Clear current list
	playerList.innerHTML = '';
	
	// Add players to list
	players.forEach(player => {
		const playerItem = document.createElement('div');
		
		// Style the player item
		Object.assign(playerItem.style, {
			padding: '5px',
			marginBottom: '5px',
			borderRadius: '3px',
			backgroundColor: player.id === NetworkManager.getPlayerId() ? 
				'rgba(0, 128, 255, 0.3)' : 'transparent'
		});
		
		// Player name
		playerItem.innerHTML = `
			<div style="display: flex; align-items: center;">
				<div style="width: 10px; height: 10px; border-radius: 50%; 
					background-color: ${player.id === NetworkManager.getPlayerId() ? '#00AAFF' : '#AAAAAA'}; 
					margin-right: 5px;"></div>
				<span>${player.name || player.id} ${player.id === NetworkManager.getPlayerId() ? '(You)' : ''}</span>
			</div>
		`;
		
		// Add computer player indicator if applicable
		if (player.isComputer) {
			playerItem.innerHTML += `<div style="font-size: 11px; color: #999;">(Computer)</div>`;
		}
		
		playerList.appendChild(playerItem);
	});
} 