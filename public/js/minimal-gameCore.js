/**
 * Shaktris Minimal Core Implementation
 * 
 * A simplified version of the game core to help with debugging and testing.
 */

// Import the network manager (at the top of the file)
import * as NetworkManager from './utils/networkManager.js';
import { showToastMessage } from './showToastMessage.js';
import { updateNetworkStatus } from './enhanced-gameCore.js';
import { setupNetworkEvents } from './enhanced-gameCore.js';
import { createNetworkStatusDisplay } from './createNetworkStatusDisplay.js';

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
	selectedChessPiece: null,
	gameStarted: false,
	isPaused: false,
	debugMode: false
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
		
		// Add loading message with proper tracking ID
		const connectionLoadingMsg = document.createElement('div');
		connectionLoadingMsg.id = 'connection-loading-message';
		connectionLoadingMsg.style.position = 'fixed';
		connectionLoadingMsg.style.top = '50%';
		connectionLoadingMsg.style.left = '50%';
		connectionLoadingMsg.style.transform = 'translate(-50%, -50%)';
		connectionLoadingMsg.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
		connectionLoadingMsg.style.color = 'white';
		connectionLoadingMsg.style.padding = '20px';
		connectionLoadingMsg.style.borderRadius = '10px';
		connectionLoadingMsg.style.zIndex = '9999';
		connectionLoadingMsg.innerHTML = 'Connecting to server...';
		document.body.appendChild(connectionLoadingMsg);
		
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
				// updateGameIdDisplay(NetworkManager.getGameId()); //function doesn't exist
				
				// Request initial state from server
				NetworkManager.sendMessage('get_game_state', { 
					gameId: NetworkManager.getGameId() 
				});
				
				// Show connected message
				showToastMessage(`Connected as ${playerName}! ${gameIdFromUrl ? 'Joined' : 'Created'} game.`);
				
				// Remove loading message
				if (document.getElementById('connection-loading-message')) {
					document.body.removeChild(document.getElementById('connection-loading-message'));
				}
			})
			.catch(error => {
				console.error('Error connecting to server:', error);
				showToastMessage('Failed to connect to server - playing in offline mode');
				
				// Remove loading message
				if (document.getElementById('connection-loading-message')) {
					document.body.removeChild(document.getElementById('connection-loading-message'));
				}
				
				// In offline mode, DO NOT create a local game state
				// Instead, just show a message
				showToastMessage('Failed to connect to server - NO PLAY in offline mode');
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
	
	// Initialize game state
	gameState = {
		board: [], // 2D array representing the board cells
		selectedPiece: null, // Currently selected chess piece
		chessPieces: [], // Array of all chess pieces
		currentTetromino: null, // Current active tetromino
		ghostPiece: null, // Ghost piece showing where tetromino will land
		validMoves: [], // Valid moves for selected chess piece
		score: 0,
		level: 1,
		turnPhase: 'tetris', // Start with tetris phase
		currentPlayer: 1, // Player 1 starts
		localPlayerId: 1, // Local player ID (from network)
		paused: false,
		gameOver: false,
		winner: null,
		lastPlacement: null, // Last tetromino placement
		lastMove: null, // Last chess move
		players: [], // List of players
		gameStarted: false // Flag to track if game has been started
	};
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
		console.warn('Board not initialized yet or empty board received from server');
		
		// Add a placeholder to indicate we're waiting for board data
		const planeGeometry = new THREE.PlaneGeometry(5, 5);
		const planeMaterial = new THREE.MeshBasicMaterial({
			color: 0x333333,
			side: THREE.DoubleSide
		});
		const plane = new THREE.Mesh(planeGeometry, planeMaterial);
		plane.rotation.x = Math.PI / 2; // Make it horizontal
		cellsContainer.add(plane);
		
		// Request game state again after a short delay
		setTimeout(() => {
			if (NetworkManager.isConnected() && NetworkManager.getGameId()) {
				console.log('Retrying game state request after empty board detection');
				requestInitialGameState();
			}
		}, 1000);
		
		return;
	}
	
	// Debug board data
	console.log('Board data:', JSON.stringify(gameState.board));
	
	// Count cells for debugging
	let cellCount = 0;
	
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
			
			// Store the cell coordinates in userData for raycasting
			cell.userData = {
				type: 'cell',
				x: x,
				z: z,
				value: cellValue
			};
			
			// Add cell to container
			cellsContainer.add(cell);
			cellCount++;
		}
	}
	
	console.log(`Created board with ${cellCount} cells`);
	
	// If no cells were added, log a warning
	if (cellCount === 0) {
		console.warn('No cells were created - board data might be incorrect');
		showToastMessage('Error: No cells in game board. Please restart the game.');
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
}

/**
 * Get player home zone position from game state
 * @param {string} playerId - Player ID to get position for
 * @returns {Object} Position with x, z coordinates and whether it was found
 */
function getPlayerHomePosition(playerId) {
	// Default position (center of board) if we can't determine actual position
	const defaultPosition = { x: 8, y: 0, z: 8, found: false };
	
	// Check if we have a valid game state
	if (!gameState || !gameState.board) {
		console.warn('Cannot determine player position: no valid game state');
		return defaultPosition;
	}
	
	// If player ID not provided, use current player
	const targetPlayerId = playerId || gameState.currentPlayer;
	if (!targetPlayerId) {
		console.warn('Cannot determine player position: no player ID provided');
		return defaultPosition;
	}
	
	// First try to find home zone in the game state
	if (gameState.homeZones && gameState.homeZones[targetPlayerId]) {
		const homeZone = gameState.homeZones[targetPlayerId];
		if (homeZone.centerX !== undefined && homeZone.centerZ !== undefined) {
			return {
				x: homeZone.centerX,
				y: 0,
				z: homeZone.centerZ,
				found: true
			};
		}
	}
	
	// Second approach: Find the player's chess pieces and focus on their average position
	if (gameState.chessPieces && gameState.chessPieces.length > 0) {
		const playerPieces = gameState.chessPieces.filter(p => p.player === targetPlayerId);
		
		if (playerPieces.length > 0) {
			// Calculate average position
			let sumX = 0, sumZ = 0;
			playerPieces.forEach(piece => {
				sumX += piece.x;
				sumZ += piece.z;
			});
			
			return {
				x: sumX / playerPieces.length,
				y: 0,
				z: sumZ / playerPieces.length,
				found: true
			};
		}
	}
	
	// Third approach: Scan the board for player's cells
	const playerHomeValue = targetPlayerId === 1 ? 6 : 7; // Blue=6, Orange=7
	const playerCells = [];
	
	for (let z = 0; z < gameState.board.length; z++) {
		const row = gameState.board[z];
		if (!row) continue;
		
		for (let x = 0; x < row.length; x++) {
			if (row[x] === playerHomeValue) {
				playerCells.push({ x, z });
			}
		}
	}
	
	if (playerCells.length > 0) {
		// Calculate average position of cells
		let sumX = 0, sumZ = 0;
		playerCells.forEach(cell => {
			sumX += cell.x;
			sumZ += cell.z;
		});
		
		return {
			x: sumX / playerCells.length,
			y: 0,
			z: sumZ / playerCells.length,
			found: true
		};
	}
	
	// If all else fails, return default position
	return defaultPosition;
}

/**
 * Reset camera to view the entire board
 * @param {boolean} animate - Whether to animate the transition
 * @param {string} playerId - Optional player ID to focus on
 */
function resetCamera(animate = true, playerId = null) {
	if (!camera || !controls) return;
	
	// Get player position from game state
	const playerPosition = getPlayerHomePosition(playerId);
	
	// Set camera position based on player position
	const targetPosition = {
		x: playerPosition.x + 15, // Position camera to the right of player
		y: 25,                    // Height above the board
		z: playerPosition.z + 15  // Position camera behind player
	};
	
	// Set look-at position to player area
	const targetLookAt = {
		x: playerPosition.x,
		y: 0,
		z: playerPosition.z
	};
	
	console.log('Resetting camera to:', targetPosition, 'looking at:', targetLookAt);
	
	if (animate && controls) {
		// Animate camera position
		const duration = 1500; // Extended for more visible movement
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
			
			// Force renderer update
			if (renderer && scene && camera) {
				renderer.render(scene, camera);
			}
			
			if (progress < 1) {
				requestAnimationFrame(animateCamera);
			} else {
				// Ensure final position is exactly what we want
				camera.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
				controls.target.set(targetLookAt.x, targetLookAt.y, targetLookAt.z);
				controls.update();
				
				// Force final render
				if (renderer && scene && camera) {
					renderer.render(scene, camera);
				}
				
				// Notify game state manager that camera animation is complete
				if (typeof gameStateManager !== 'undefined' && 
					typeof gameStateManager.onCameraAnimationComplete === 'function') {
					gameStateManager.onCameraAnimationComplete();
				}
			}
		}
		
		// Start animation
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
		
		// Notify game state manager that camera animation is complete (immediately)
		if (typeof gameStateManager !== 'undefined' && 
			typeof gameStateManager.onCameraAnimationComplete === 'function') {
			gameStateManager.onCameraAnimationComplete();
		}
	}
	
	// Force renderer update
	if (renderer && scene && camera) {
		renderer.render(scene, camera);
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
		startHeight: 8 // Start higher above the board (was 5)
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
		// Only proceed if the game has actually started and we're in tetris phase
		if (!gameState.gameStarted) {
			// console.log("Game not started yet, tetromino won't fall");
			return;
		}
		
		if (gameState.turnPhase === 'tetris' && gameState.currentTetromino) {
			// Move tetromino down in Y-axis 
			if (gameState.currentTetromino.startHeight > 0) {
				// Only check for collision when we're very close to board level
				if (gameState.currentTetromino.startHeight < 0.5) {
					// Check for collision as we approach board level
					const shape = gameState.currentTetromino.shape;
					const posX = gameState.currentTetromino.position.x;
					const posZ = gameState.currentTetromino.position.z;
					let collision = checkForCollisionAtPosition(shape, posX, posZ);
					
					if (collision) {
						// Explode the tetromino piece since we hit the top of existing pieces
						console.log("Collision detected while falling - exploding tetromino");
						showExplosionAnimation(posX, posZ);
						
						// Clear the current tetromino
						gameState.currentTetromino = null;
						
						// Clear existing tetromino group
						while (tetrominoGroup.children.length > 0) {
							tetrominoGroup.remove(tetrominoGroup.children[0]);
						}
						
						// Change to chess phase
						gameState.turnPhase = 'chess';
						showToastMessage('Tetromino exploded! Chess phase now.');
						
						// Update game status display
						updateGameStatusDisplay();
						
						// Clear interval
						clearInterval(gameState.fallInterval);
						return;
					}
				}
				
				// Continue falling
				gameState.currentTetromino.startHeight -= 0.2;
				
				// Make sure we don't go below 0
				if (gameState.currentTetromino.startHeight < 0) {
					gameState.currentTetromino.startHeight = 0;
				}
				
				updateTetrominoVisuals();
			} else {
				// When at board level, try to move down one step
				const shape = gameState.currentTetromino.shape;
				const posX = gameState.currentTetromino.position.x;
				const posZ = gameState.currentTetromino.position.z + 1; // One step down
				
				// Check for collision at the new position
				let collision = checkForCollisionAtPosition(shape, posX, posZ);
				
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
 * Check for collision at a specific position
 * @param {Array} shape - Tetromino shape
 * @param {number} posX - X position
 * @param {number} posZ - Z position
 * @returns {boolean} - Whether there's a collision
 */
function checkForCollisionAtPosition(shape, posX, posZ) {
	// Check each cell in the tetromino shape
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// Check if this position would overlap with an existing board cell
				if (gameState.board[boardZ] && 
					gameState.board[boardZ][boardX] !== undefined && 
					gameState.board[boardZ][boardX] !== 0) {
					return true; // Collision detected
				}
			}
		}
	}
	
	return false; // No collision
}

/**
 * Update the ghost piece (preview of where the tetromino will land)
 */
function updateGhostPiece() {
	if (!gameState.currentTetromino) return;
	
	// Clone the current tetromino
	gameState.ghostPiece = JSON.parse(JSON.stringify(gameState.currentTetromino));
	
	// Set height to 0 to show at board level
	gameState.ghostPiece.startHeight = 0;
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
					const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);
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
						0.5, // Now positioned correctly above the board
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
	
	// Only handle key presses if the game has actually started
	if (!gameState.gameStarted) {
		console.log(`Key ignored: ${event.key} - game not started yet`);
		showToastMessage("Please click 'Start Playing' to begin the game");
		return false;
	}
	
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
	
	// Log action taken
	if (actionTaken) {
		console.log(`Action taken for key: ${event.key}`);
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
 * Handle mouse clicks on the game board
 * @param {MouseEvent} event - Mouse event
 */
function handleMouseClick(event) {
	// Log the click
	console.log('Document click detected at:', event.clientX, event.clientY);
	
	// Get click position
	const rect = renderer.domElement.getBoundingClientRect();
	const mouseX = event.clientX - rect.left;
	const mouseY = event.clientY - rect.top;
	
	// Check for UI element clicks
	if (handleUIElementClick(event)) {
		console.log('Click handled by UI element');
		return;
	}
	
	// Show visual feedback at the click point
	showClickIndicator(mouseX, mouseY);
	
	// Cast a ray from the camera through the mouse position
	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2(
		(mouseX / renderer.domElement.clientWidth) * 2 - 1,
		-(mouseY / renderer.domElement.clientHeight) * 2 + 1
	);
	
	raycaster.setFromCamera(mouse, camera);
	
	// Handle UI clicks first
	if (handleUIClick(raycaster)) {
		console.log('Click handled by 3D UI element');
		return;
	}
	
	// Only handle clicks in chess phase
	if (!gameState.turnPhase) {
		// If phase is null or undefined, set to tetris and create a tetromino
		gameState.turnPhase = 'tetris';
		if (!gameState.currentTetromino) {
			createNewTetromino();
		}
		showToastMessage("Game starting - place your tetromino!");
		updateGameStatusDisplay();
		return;
	} else if (gameState.turnPhase !== 'chess') {
		console.log("Click ignored - not in chess phase (current phase: " + gameState.turnPhase + ")");
		showToastMessage("Currently in " + gameState.turnPhase + " phase. Switch to chess phase to move pieces.");
		return;
	}
	
	console.log('In chess phase - processing click...');
	
	// Check for intersections with all objects in the scene
	const intersects = raycaster.intersectObjects(scene.children, true);
	
	// Ignore clicks if there's no intersection
	if (intersects.length === 0) {
		console.log('No intersection detected');
		// Deselect any selected piece
		if (gameState.selectedPiece) {
			console.log('No board cell clicked, deselecting piece');
			gameState.selectedPiece = null;
			showValidMoves(false); // Hide valid moves
			showToastMessage('Piece deselected');
		}
		return;
	}
	
	// Debug what was clicked
	console.log('Intersections found:', intersects.length);
	intersects.forEach((intersect, index) => {
		const userDataStr = intersect.object.userData ? 
			JSON.stringify(intersect.object.userData).substring(0, 100) : 'No userData';
		console.log(`Intersection ${index}:`, 
			intersect.object.name || 'unnamed', 
			`type: ${intersect.object.userData?.type || 'unknown'}`,
			`userData: ${userDataStr}`);
	});
	
	// First check if we hit a chess piece
	let hitChessPiece = false;
	for (const intersect of intersects) {
		if (intersect.object.userData && intersect.object.userData.type === 'chessPiece') {
			const userData = intersect.object.userData;
			console.log('Chess piece clicked:', userData);
			
			// Find the corresponding piece in our game state
			const piece = gameState.chessPieces.find(p => 
				p.type === userData.pieceType && 
				p.x === userData.x && 
				p.z === userData.z && 
				p.player === userData.player);
			
			if (piece) {
				console.log('Found matching piece in game state:', piece);
				
				// Check if it's the player's piece
				if (piece.player === gameState.currentPlayer) {
					// Select the piece
					gameState.selectedPiece = piece;
					showToastMessage(`Selected ${piece.type} at ${piece.x}, ${piece.z}`);
					
					// Show valid moves
					showValidMoves(true);
					hitChessPiece = true;
					break;
				} else {
					console.log(`Cannot select opponent's piece (player ${piece.player})`);
					showToastMessage(`This is Player ${piece.player}'s piece. You are Player ${gameState.currentPlayer}.`);
					hitChessPiece = true;
					break;
				}
			} else {
				console.log('No matching piece found in game state for clicked object');
			}
		}
	}
	
	// If we hit a chess piece, stop processing the click
	if (hitChessPiece) {
		return;
	}
	
	// If we didn't hit a chess piece, check for board cells
	let boardCellClicked = false;
	for (const intersect of intersects) {
		// Check if we hit a cell
		if (intersect.object.userData && intersect.object.userData.type === 'cell') {
			const cellX = intersect.object.userData.x;
			const cellZ = intersect.object.userData.z;
			
			console.log(`Cell clicked: x=${cellX}, z=${cellZ}`);
			
			// Handle chess move
			handleChessMove(cellX, cellZ);
			
			boardCellClicked = true;
			break;
		}
	}
	
	// If no board cell was clicked, deselect any selected piece
	if (!boardCellClicked && !hitChessPiece && gameState.selectedPiece) {
		console.log('No board cell clicked, deselecting piece');
		gameState.selectedPiece = null;
		showValidMoves(false); // Hide valid moves
		showToastMessage('Piece deselected');
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
 * Place tetromino on the board
 */
function placeTetromino() {
	if (!gameState.currentTetromino) return;
	
	try {
		// Clone the current tetromino for sending to server
		const tetrominoData = {
			type: gameState.currentTetromino.type,
			shape: gameState.currentTetromino.shape,
			position: { ...gameState.currentTetromino.position },
			player: gameState.currentPlayer
		};
		
		// Check if we can place the tetromino
		// First check if adjacent to existing cells (unless it's the first player's first piece)
		let isPlayerFirstPiece = false;
		if (gameState.board.flat().filter(cell => cell === gameState.currentPlayer).length === 0) {
			isPlayerFirstPiece = true;
		}
		
		if (!isPlayerFirstPiece && !isTetrominoAdjacentToExistingCells(
			gameState.currentTetromino.shape,
			gameState.currentTetromino.position.x,
			gameState.currentTetromino.position.z
		)) {
			console.log('Tetromino must be adjacent to existing cells');
			showToastMessage('Tetromino must be adjacent to existing cells');
			
			// Show explosion and proceed to chess phase
			showExplosionAnimation(
				gameState.currentTetromino.position.x,
				gameState.currentTetromino.position.z
			);
			
			// Clear the current tetromino
			gameState.currentTetromino = null;
			
			// Clear existing tetromino group
			while (tetrominoGroup.children.length > 0) {
				tetrominoGroup.remove(tetrominoGroup.children[0]);
			}
			
			// Change to chess phase
			gameState.turnPhase = 'chess';
			showToastMessage('Tetromino disintegrated! Chess phase now.');
			
			// Update game status display
			updateGameStatusDisplay();
			
			return;
		}
		
		// Collect the positions we'll modify
		const shape = gameState.currentTetromino.shape;
		const posX = gameState.currentTetromino.position.x;
		const posZ = gameState.currentTetromino.position.z;
		const positions = [];
		
		for (let z = 0; z < shape.length; z++) {
			for (let x = 0; x < shape[z].length; x++) {
				if (shape[z][x] === 1) {
					const boardX = posX + x;
					const boardZ = posZ + z;
					
					// Ensure the board position exists
					if (!gameState.board[boardZ]) {
						gameState.board[boardZ] = [];
					}
					
					if (gameState.board[boardZ][boardX] !== 0) {
						// Cell already occupied - we should have checked for this!
						console.error('Attempt to place tetromino on occupied cell!');
						// Show explosion
						showExplosionAnimation(posX, posZ);
						showToastMessage('Collision detected!');
						
						// Clear the current tetromino
						gameState.currentTetromino = null;
						
						// Clear existing tetromino group
						while (tetrominoGroup.children.length > 0) {
							tetrominoGroup.remove(tetrominoGroup.children[0]);
						}
						
						// Change to chess phase
						gameState.turnPhase = 'chess';
						showToastMessage('Tetromino disintegrated! Chess phase now.');
						
						// Update game status display
						updateGameStatusDisplay();
						
						return;
					}
					
					positions.push({ x: boardX, z: boardZ });
				}
			}
		}
		
		// Store original board state for potential rollback
		const originalBoardState = JSON.parse(JSON.stringify(gameState.board));
		const savedTetromino = { ...gameState.currentTetromino };
		
		// Clear the current tetromino and visuals before applying changes
		// This prevents issues if placement fails
		const tempTetromino = gameState.currentTetromino;
		gameState.currentTetromino = null;
		
		// Clear existing tetromino group
		while (tetrominoGroup.children.length > 0) {
			tetrominoGroup.remove(tetrominoGroup.children[0]);
		}
		
		// Apply the positions locally FIRST (optimistic UI)
		for (const pos of positions) {
			gameState.board[pos.z][pos.x] = gameState.currentPlayer;
		}
		
		// Update the board visualization
		createBoard();
		
		// Send to server - wait for response before proceeding
		sendTetrominoPlacementToServer(tetrominoData)
			.then(response => {
				if (response && response.success) {
					// Server accepted the placement, proceed to chess phase
					console.log('Server confirmed tetromino placement');
					
					// Change to chess phase
					gameState.turnPhase = 'chess';
					showToastMessage('Chess phase - move your pieces!');
					
					// Update game status display
					updateGameStatusDisplay();
				} else {
					// Server rejected the placement, remove the pieces but still proceed to chess phase
					console.error('Server rejected tetromino placement - tetromino disintegrates');
					
					// Show explosion effect
					showExplosionAnimation(posX, posZ);
					
					// Remove the tetromino pieces we placed (revert local board change)
					for (const pos of positions) {
						if (gameState.board[pos.z]) {
							gameState.board[pos.z][pos.x] = 0;
						}
					}
					
					// Update the board visualization after removal
					createBoard();
					
					// Still proceed to chess phase
					gameState.turnPhase = 'chess';
					showToastMessage('Server rejected placement - tetromino disintegrated. Chess phase now.');
					
					// Update game status display
					updateGameStatusDisplay();
				}
			})
			.catch(error => {
				console.error('Connection error during tetromino placement:', error);
				
				// Connection error - revert the placement
				gameState.board = originalBoardState;
				
				// Show explosion (tetromino destroyed)
				showExplosionAnimation(posX, posZ);
				
				// Update visuals
				createBoard();
				
				// Move to chess phase anyway
				gameState.turnPhase = 'chess';
				showToastMessage('Connection error - tetromino disintegrated. Chess phase now.');
				
				// Update game status display
				updateGameStatusDisplay();
			});
	} catch (error) {
		console.error('Error placing tetromino:', error);
		
		// On error, show explosion and move to chess phase
		if (gameState.currentTetromino) {
			showExplosionAnimation(
				gameState.currentTetromino.position.x,
				gameState.currentTetromino.position.z
			);
			
			// Clear the current tetromino
			gameState.currentTetromino = null;
			
			// Clear existing tetromino group
			while (tetrominoGroup.children.length > 0) {
				tetrominoGroup.remove(tetrominoGroup.children[0]);
			}
		}
		
		// Change to chess phase
		gameState.turnPhase = 'chess';
		showToastMessage('Error! Tetromino disintegrated. Chess phase now.');
		
		// Update game status display
		updateGameStatusDisplay();
	}
}

/**
 * Send tetromino placement to server
 * @param {Object} tetrominoData - Tetromino data to send
 */
function sendTetrominoPlacementToServer(tetrominoData) {
	console.log('Sending tetromino placement to server:', tetrominoData);
	
	// Check if connected to the network
	if (!NetworkManager.isConnected()) {
		console.warn('Not connected to server. Continuing with local placement only.');
		// Still continue with the local placement
		return Promise.resolve({ success: true });
	}
	
	// Debug gameId and playerId
	const gameId = NetworkManager.getGameId();
	const playerId = NetworkManager.getPlayerId();
	
	console.log(`Debug - gameId: ${gameId}, playerId: ${playerId}`);
	
	// If gameId is missing, try to join a game first
	if (!gameId) {
		console.log('No gameId detected, attempting to join/create a game first');
		return NetworkManager.joinGame()
			.then(gameData => {
				console.log('Joined game:', gameData);
				// Force update of gameId in the NetworkManager if needed
				if (gameData && gameData.gameId) {
					console.log('Setting gameId manually:', gameData.gameId);
					// Check if NetworkManager has an updateGameId method, if not this is a no-op
					if (typeof NetworkManager.updateGameId === 'function') {
						NetworkManager.updateGameId(gameData.gameId);
					}
				}
				// Now try again with the newly joined game
				return NetworkManager.submitTetrominoPlacement(tetrominoData);
			})
			.then(response => {
				if (response && response.success) {
					console.log('Server accepted tetromino placement after joining game');
					return response;
				} else {
					console.error('Server rejected tetromino placement after joining game:', response);
					// Instead of throwing an error, return a rejection object
					return { success: false, reason: 'rejected' };
				}
			})
			.catch(error => {
				console.error('Error connecting to server during tetromino placement:', error);
				// Connection error - reject with error
				throw error;
			});
	}
	
	// Ensure pieceType is set properly - this is what the server expects
	const modifiedData = {
		...tetrominoData,
		pieceType: tetrominoData.type // Add pieceType property matching the type
	};
	
	console.log('Modified tetromino data for server:', modifiedData);
	
	// Return a promise
	return NetworkManager.submitTetrominoPlacement(modifiedData)
		.then(response => {
			if (response && response.success) {
				console.log('Server accepted tetromino placement');
				return response;
			} else {
				console.error('Server rejected tetromino placement:', response);
				// Instead of throwing an error, return a rejection object
				return { success: false, reason: 'rejected' };
			}
		})
		.catch(error => {
			console.error('Error sending tetromino placement to server:', error);
			// Connection error - reject with error
			throw error;
		});
}

/**
 * Check for collision at a specific position
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
 * @param {string} playerId - Optional player ID to focus on
 */
export function resetCameraView(animate = true, playerId = null) {
	resetCamera(animate, playerId);
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
		case 6: return 0x3333ff; // Player 1 home (blue)
		case 7: return 0xff8800; // Player 2 home (orange)
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
	console.log(`${show ? 'Showing' : 'Hiding'} valid moves`);
	
	// Remove existing move indicators
	let moveIndicators = scene.getObjectByName('moveIndicators');
	if (moveIndicators) {
		console.log('Removing existing move indicators');
		scene.remove(moveIndicators);
	}
	
	// If we're not showing moves or no piece is selected, we're done
	if (!show || !gameState.selectedPiece) {
		console.log('Not showing moves - no piece selected or show=false');
		return;
	}
	
	// Get valid moves for the selected piece
	const validMoves = getValidMoves(gameState.selectedPiece);
	console.log(`Found ${validMoves.length} valid moves for ${gameState.selectedPiece.type}:`, validMoves);
	
	// Create a new group to hold move indicators
	moveIndicators = new THREE.Group();
	moveIndicators.name = 'moveIndicators';
	
	// Offset for centering board
	const offsetX = gameState.boardSize / 2 - 0.5;
	const offsetZ = gameState.boardSize / 2 - 0.5;
	
	// Create indicators for each valid move
	for (const move of validMoves) {
		// Check if there's a piece at this location (capture)
		const targetPiece = gameState.chessPieces.find(p => p.x === move.x && p.z === move.z);
		
		// Create different indicators for regular moves vs captures
		const indicatorGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
		const indicatorMaterial = new THREE.MeshBasicMaterial({
			color: targetPiece ? 0xff0000 : 0x00ff00,
			transparent: true,
			opacity: 0.6
		});
		
		const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
		
		// Position indicator
		indicator.position.set(
			move.x - offsetX, 
			1.0, // Slightly above the board
			move.z - offsetZ
		);
		
		// Store move information in the indicator for use when clicked
		indicator.userData = {
			moveX: move.x,
			moveZ: move.z,
			type: 'moveIndicator',
			isCapture: !!targetPiece
		};
		
		// Add to the group
		moveIndicators.add(indicator);
	}
	
	// Add all move indicators to the scene
	scene.add(moveIndicators);
	console.log(`Added ${moveIndicators.children.length} move indicators to scene`);
	
	// Add an animation effect to make the indicators more visible
	const startTime = Date.now();
	const animate = () => {
		// Only continue if move indicators still exist
		if (!scene.getObjectByName('moveIndicators')) {
			return;
		}
		
		const time = Date.now() - startTime;
		const scale = 1 + 0.1 * Math.sin(time * 0.005);
		
		moveIndicators.children.forEach(indicator => {
			indicator.scale.set(scale, 1, scale);
			indicator.rotation.y += 0.01;
			
			// Pulse the opacity
			indicator.material.opacity = 0.4 + 0.3 * Math.sin(time * 0.005);
		});
		
		requestAnimationFrame(animate);
	};
	
	// Start the animation
	animate();
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
	// No need to check board boundaries since the board can now extend infinitely
	// Instead, check if the row and cell exist and have a valid value
	
	// Check if the row exists in the board
	if (!gameState.board[z]) {
		return false;
	}
	
	// Check if the cell exists in the row and is not empty
	return gameState.board[z][x] !== undefined && gameState.board[z][x] !== 0;
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
function handleChessMove(targetX, targetZ) {
	console.log(`Handling chess move to (${targetX}, ${targetZ})`);
	
	// Check if it's chess phase
	if (gameState.turnPhase !== 'chess') {
		console.log('Not chess phase');
		showToastMessage('Complete tetris phase first!');
		return;
	}
	
	// Check if we have a selected piece
	if (!gameState.selectedPiece) {
		console.log('No piece selected');
		
		// Check if there's a piece at the clicked position that belongs to current player
		const pieceAtPosition = gameState.chessPieces.find(p => 
			p.x === targetX && 
			p.z === targetZ && 
			p.player === gameState.currentPlayer);
		
		if (pieceAtPosition) {
			// Select this piece
			console.log(`Selecting piece at (${targetX}, ${targetZ}):`, pieceAtPosition);
			gameState.selectedPiece = pieceAtPosition;
			showToastMessage(`Selected ${pieceAtPosition.type} at (${pieceAtPosition.x}, ${pieceAtPosition.z})`);
			
			// Show valid moves
			showValidMoves(true);
		} else {
			// There's no piece at the clicked position that belongs to current player
			console.log(`No piece at (${targetX}, ${targetZ}) or not current player's piece`);
			showToastMessage('Select your chess piece first');
		}
		return;
	}
	
	// Get the valid moves for the selected piece
	const validMoves = getValidMoves(gameState.selectedPiece);
	console.log(`Valid moves for selected ${gameState.selectedPiece.type}:`, validMoves);
	
	// Check if the target position is a valid move
	const isValidMove = validMoves.some(move => move.x === targetX && move.z === targetZ);
	
	if (!isValidMove) {
		console.log(`Invalid move to (${targetX}, ${targetZ})`);
		showToastMessage('Invalid move. Select a highlighted position.');
		return;
	}
	
	// Check if there's a piece to capture at the target position
	const capturedPiece = gameState.chessPieces.find(p => p.x === targetX && p.z === targetZ);
	
	// Create move data
	const moveData = {
		pieceId: gameState.selectedPiece.id || `piece_${gameState.selectedPiece.type}_${gameState.selectedPiece.x}_${gameState.selectedPiece.z}`,
		fromPosition: {
			x: gameState.selectedPiece.x,
			z: gameState.selectedPiece.z
		},
		targetPosition: {
			x: targetX,
			z: targetZ
		},
		capture: capturedPiece ? {
			pieceId: capturedPiece.id || `piece_${capturedPiece.type}_${capturedPiece.x}_${capturedPiece.z}`,
			type: capturedPiece.type,
			player: capturedPiece.player
		} : null
	};
	
	console.log('Move data:', moveData);
	
	// Execute the move locally first
	const originalX = gameState.selectedPiece.x;
	const originalZ = gameState.selectedPiece.z;
	
	// If capturing, remove the captured piece
	if (capturedPiece) {
		gameState.chessPieces = gameState.chessPieces.filter(p => p !== capturedPiece);
	}
	
	// Update the piece's position
	gameState.selectedPiece.x = targetX;
	gameState.selectedPiece.z = targetZ;
	
	// Hide valid moves
	showValidMoves(false);
	
	// Deselect the piece
	gameState.selectedPiece = null;
	
	// Update visuals
	updateChessPieces();
	
	// Show capture animation if applicable
	if (capturedPiece) {
		showCaptureEffect(targetX, targetZ);
	}
	
	// Send the move to the server if connected
	if (NetworkManager.isConnected()) {
		console.log('Sending chess move to server');
		sendChessMoveToServer(moveData)
			.then(response => {
				console.log('Server accepted move:', response);
				
				// Server confirmed the move, proceed to tetris phase
				if (response && response.success) {
					// Show success message
					showToastMessage(capturedPiece ? 
						`Captured ${capturedPiece.type}! Tetris phase now.` : 
						'Tetris phase now.');
					
					// After chess move, it's tetris phase again
					gameState.turnPhase = 'tetris';
					
					// Create a new tetromino for the next phase
					createNewTetromino();
					
					// Update status display
					updateGameStatusDisplay();
				}
			})
			.catch(error => {
				console.error('Error sending chess move to server:', error);
				
				// Revert the move locally
				gameState.selectedPiece = null;
				
				// Still proceed to tetris phase
				gameState.turnPhase = 'tetris';
				
				// Create a new tetromino
				createNewTetromino();
				
				// Update status display
				updateGameStatusDisplay();
				
				showToastMessage('Move sent with errors. Tetris phase now.');
			});
	} else {
		// Not connected to server, still move to tetris phase
		gameState.turnPhase = 'tetris';
		
		// Create a new tetromino
		createNewTetromino();
		
		// Update status display
		updateGameStatusDisplay();
		
		showToastMessage(capturedPiece ? 
			`Captured ${capturedPiece.type}! Tetris phase now.` : 
			'Tetris phase now.');
	}
}

/**
 * Send chess move to server
 * @param {Object} moveData - Chess move data to send
 */
function sendChessMoveToServer(moveData) {
	console.log('Sending chess move to server:', moveData);
	
	// Check if connected to the network
	if (!NetworkManager.isConnected()) {
		console.warn('Not connected to server. Continuing with local move only.');
		// Still continue with the local move
		return Promise.resolve({ success: true });
	}
	
	// Debug gameId and playerId
	const gameId = NetworkManager.getGameId();
	const playerId = NetworkManager.getPlayerId();
	
	console.log(`Debug - gameId: ${gameId}, playerId: ${playerId}`);
	
	// If gameId is missing, try to join a game first
	if (!gameId) {
		console.log('No gameId detected, attempting to join/create a game first');
		return NetworkManager.joinGame()
			.then(gameData => {
				console.log('Joined game:', gameData);
				// Force update of gameId in the NetworkManager if needed
				if (gameData && gameData.gameId) {
					console.log('Setting gameId manually:', gameData.gameId);
					// Check if NetworkManager has an updateGameId method, if not this is a no-op
					if (typeof NetworkManager.updateGameId === 'function') {
						NetworkManager.updateGameId(gameData.gameId);
					}
				}
				// Now try again with the newly joined game
				return NetworkManager.submitChessMove(moveData);
			})
			.then(response => {
				if (response && response.success) {
					console.log('Server accepted chess move after joining game');
					return response;
				} else {
					console.error('Server rejected chess move after joining game:', response);
					// Instead of throwing an error, return a rejection object
					return { success: false, reason: 'rejected' };
				}
			})
			.catch(error => {
				console.error('Error connecting to server during chess move:', error);
				// Connection error - reject with error
				throw error;
			});
	}
	
	// Return a promise
	return NetworkManager.submitChessMove(moveData)
		.then(response => {
			if (response && response.success) {
				console.log('Server accepted chess move');
				return response;
			} else {
				console.error('Server rejected chess move:', response);
				// Instead of throwing an error, return a rejection object
				return { success: false, reason: 'rejected' };
			}
		})
		.catch(error => {
			console.error('Error sending chess move to server:', error);
			// Connection error - reject with error
			throw error;
		});
}

/**
 * Update chess pieces visualization
 */
function updateChessPieces() {
	console.log('Updating chess pieces visualization with', gameState.chessPieces.length, 'pieces');
	
	// Clear existing chess pieces
	while (chessPiecesGroup.children.length > 0) {
		chessPiecesGroup.remove(chessPiecesGroup.children[0]);
	}
	
	// If no chess pieces, log warning and return
	if (!gameState.chessPieces || !Array.isArray(gameState.chessPieces) || gameState.chessPieces.length === 0) {
		console.warn('No chess pieces to render');
		return;
	}
	
	// Offset for centering board
	const offsetX = gameState.boardSize / 2 - 0.5;
	const offsetZ = gameState.boardSize / 2 - 0.5;
	
	// Create a mapping of piece types to more descriptive debug names
	const pieceTypeDebug = {
		'pawn': 'Pawn',
		'rook': 'Rook',
		'knight': 'Knight',
		'bishop': 'Bishop',
		'queen': 'Queen',
		'king': 'King'
	};
	
	// Debug: log pieces by type and player
	const piecesByType = {};
	gameState.chessPieces.forEach(piece => {
		const key = `${piece.type}_p${piece.player}`;
		if (!piecesByType[key]) piecesByType[key] = 0;
		piecesByType[key]++;
	});
	console.log('Pieces by type:', piecesByType);
	
	// Render chess pieces
	let piecesCreated = 0;
	let piecesSkipped = 0;
	
	for (let i = 0; i < gameState.chessPieces.length; i++) {
		const piece = gameState.chessPieces[i];
		
		// Skip invalid pieces
		if (!piece.type || piece.x === undefined || piece.z === undefined || piece.player === undefined) {
			console.warn('Skipping invalid chess piece:', piece);
			piecesSkipped++;
			continue;
		}
		
		// Validate coordinates are within sensible ranges
		if (piece.x < 0 || piece.x >= 100 || piece.z < 0 || piece.z >= 100) {
			console.warn(`Piece at extreme coordinates (${piece.x},${piece.z}), skipping:`, piece);
			piecesSkipped++;
			continue;
		}
		
		// Get piece color based on player number (1=blue, 2=orange)
		const color = piece.player === 1 ? 0x3333ff : 0xff8800;
		
		// Check the height of the cell at the piece's position (0 if not on a cell)
		let cellHeight = 0;
		try {
			// Make sure we have valid board data
			if (gameState.board && 
				gameState.board[piece.z] && 
				gameState.board[piece.z][piece.x] !== undefined && 
				gameState.board[piece.z][piece.x] !== 0) {
				cellHeight = 1; // Cell exists and is not empty
			}
		} catch (error) {
			console.warn(`Error checking cell height at (${piece.x},${piece.z}):`, error);
		}
		
		// Base height of the piece - place on top of cells
		const baseHeight = cellHeight;
		
		// Create piece geometry based on type
		let geometry;
		let height = baseHeight;
		
		// Debug log piece creation
		console.log(`Creating ${pieceTypeDebug[piece.type] || piece.type} for player ${piece.player} at (${piece.x},${piece.z})`);
		
		try {
			switch (piece.type.toLowerCase()) {
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
					knightGroup.userData = { 
						pieceIndex: i,
						type: 'chessPiece',
						x: piece.x,
						z: piece.z,
						pieceType: piece.type,
						player: piece.player
					};
					
					knightGroup.castShadow = true;
					knightGroup.receiveShadow = true;
					
					// Increment counter and skip the standard piece creation for knight
					piecesCreated++;
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
					
					// Store piece info in the group's userData
					kingGroup.userData = { 
						pieceIndex: i,
						type: 'chessPiece',
						x: piece.x,
						z: piece.z,
						pieceType: piece.type,
						player: piece.player
					};
					
					kingGroup.castShadow = true;
					kingGroup.receiveShadow = true;
					
					// Increment counter and skip the standard piece creation for king
					piecesCreated++;
					continue;
					
				default:
					// Default simple box for unrecognized piece types
					console.warn(`Unknown piece type: ${piece.type}, using default box`);
					geometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
					height = baseHeight + 0.4;
			}
			
			// Create material with stronger colors to be more visible
			const material = new THREE.MeshStandardMaterial({
				color,
				roughness: 0.7,
				metalness: 0.3,
				emissive: color,
				emissiveIntensity: 0.2 // Add glow to make pieces more visible
			});
			
			// Create mesh
			const pieceMesh = new THREE.Mesh(geometry, material);
			pieceMesh.position.set(
				piece.x - offsetX,
				height, // Position based on height
				piece.z - offsetZ
			);
			
			// Store piece info in the mesh's userData for raycasting
			pieceMesh.userData = { 
				pieceIndex: i,
				type: 'chessPiece',
				x: piece.x,
				z: piece.z,
				pieceType: piece.type,
				player: piece.player
			};
			
			pieceMesh.castShadow = true;
			pieceMesh.receiveShadow = true;
			chessPiecesGroup.add(pieceMesh);
			
			// Increment counter for successfully created pieces
			piecesCreated++;
			
		} catch (error) {
			console.error(`Error creating chess piece (${piece.type}) at (${piece.x},${piece.z}):`, error);
			piecesSkipped++;
		}
	}
	
	// Log summary
	console.log(`Chess pieces rendering complete: ${piecesCreated} created, ${piecesSkipped} skipped`);
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
		
		<button id="tutorial-close" style="padding: 12px 30px; background-color: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; margin-top: 15px; font-size: 18px; font-weight: bold; animation: pulse 2s infinite;">START PLAYING</button>
	`;
	
	// Add pulse animation style
	const style = document.createElement('style');
	style.textContent = `
		@keyframes pulse {
			0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52, 152, 219, 0.7); }
			50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(52, 152, 219, 0); }
			100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52, 152, 219, 0); }
		}
	`;
	document.head.appendChild(style);
	
	// Add to body
	document.body.appendChild(tutorialElement);
	
	// Add event listener to close button
	document.getElementById('tutorial-close').addEventListener('click', () => {
		console.log('START PLAYING button clicked - starting game...');
		
		// Remove the tutorial
		document.body.removeChild(tutorialElement);
		
		// Start the game with a slight delay to ensure UI updates
		setTimeout(() => {
			startPlayingGame(); // Start the game when "Start Playing" is clicked
		}, 100);
	});
}

/**
 * Start playing the game
 */
function startPlayingGame() {
	console.log('Starting game...');
	
	// Prevent multiple start attempts
	if (gameState.gameStarted) {
		console.log('Game already started, ignoring request');
		showToastMessage('Game already in progress!');
		return;
	}
	
	// Mark game as started
	gameState.gameStarted = true;
	
	// Show a toast notification (only once)
	showToastMessage('Starting game!');
	
	// Force a camera jolt to ensure movement is visible
	if (camera) {
		// Move camera 10 units to make the reset more noticeable
		camera.position.x += 10;
		camera.position.y += 10;
		camera.position.z += 10;
		
		if (renderer && scene) {
			renderer.render(scene, camera);
		}
	}
	
	// Reset camera with animation - do this immediately with closer zoom
	resetCameraForGameplay(true);
	
	// Only need to do this once - removes all previous timeout handlers
	let hasRunResetSequence = false;
	
	// Run a camera reset sequence with multiple steps for reliability
	const cameraResetSequence = () => {
		if (hasRunResetSequence) return;
		hasRunResetSequence = true;
		
		// Schedule multiple follow-up resets with increasing delays to ensure camera is correctly positioned
		setTimeout(() => resetCameraForGameplay(true), 300);
		setTimeout(() => resetCameraForGameplay(true), 1000);
		setTimeout(() => resetCameraForGameplay(true), 2000);
	};
	
	// Start the camera reset sequence
	cameraResetSequence();
	
	// Remove the connecting message if it exists
	if (document.getElementById('connection-loading-message')) {
		document.body.removeChild(document.getElementById('connection-loading-message'));
	}
	
	// Check connection and possibly join a game first, but only if not already in one
	if (NetworkManager.isConnected()) {
		updateNetworkStatus('connected');
		
		// Prevent multiple game joins - use a flag to track state
		let gameJoinInitiated = false;
		
		// Check if we already have a game ID (to avoid multiple joins)
		if (!NetworkManager.getGameId()) {
			console.log('No game ID found, joining a new game');
			
			if (!gameJoinInitiated) {
				gameJoinInitiated = true;
				
				NetworkManager.joinGame()
					.then(gameData => {
						console.log('Joined game:', gameData);
						updateNetworkStatus('connected');
						
						// Request game state from server using our improved function
						requestExplicitGameState();
						
						// Start the first turn after a short delay
						setTimeout(() => startFirstTurn(), 1500);
					})
					.catch(error => {
						console.error('Failed to join game:', error);
						updateNetworkStatus('connected');
						
						// Still start the game locally
						startFirstTurn();
					});
			}
		} else {
			console.log('Already in game:', NetworkManager.getGameId());
			// Already in a game, request the game state and start playing
			requestExplicitGameState();
			
			// Start the first turn after a short delay
			setTimeout(() => startFirstTurn(), 1500);
		}
	} else {
		// Try to connect first, then join a game
		let connectionInitiated = false;
		
		if (!connectionInitiated) {
			connectionInitiated = true;
			
			NetworkManager.initialize('Player_' + Math.floor(Math.random() * 1000))
				.then(() => {
					console.log('Connection initialized, joining game...');
					return NetworkManager.joinGame();
				})
				.then(gameData => {
					console.log('Joined game:', gameData);
					updateNetworkStatus('connected');
					
					// Request player list after joining
					NetworkManager.requestPlayerList();
					
					// Request game state from server using our improved function
					requestExplicitGameState();
					
					// Start the first turn after a short delay
					setTimeout(() => startFirstTurn(), 1500);
				})
				.catch(error => {
					console.error('Failed to connect to server:', error);
					updateNetworkStatus('disconnected');
					
					// Still start the game locally
					startFirstTurn();
				});
		}
	}
	
	// Request player list in all cases, but only once
	if (NetworkManager.isConnected()) {
		NetworkManager.requestPlayerList();
	}
}

/**
 * Reset camera with specific gameplay settings (closer to the action)
 * @param {boolean} animate - Whether to animate the camera movement
 */
function resetCameraForGameplay(animate = true) {
	console.log('Resetting camera for gameplay view');
	
	// Define target position - much closer to the action
	const targetPosition = {
		x: 5, // Closer x position
		y: 15, // Lower height for better view
		z: 25  // Further back for better view of the board
	};
	
	// Look at position - center of player's area
	const lookAt = {
		x: 5, // Focus more on the player area (home zone)
		y: 0,
		z: 12
	};
	
	// Set camera position immediately or animate
	if (!animate) {
		camera.position.set(targetPosition.x, targetPosition.y, targetPosition.z);
		controls.target.set(lookAt.x, lookAt.y, lookAt.z);
		controls.update();
		return;
	}
	
	// Get current position
	const startPosition = {
		x: camera.position.x,
		y: camera.position.y,
		z: camera.position.z
	};
	
	// Get current look-at
	const startLookAt = controls.target.clone();
	
	// Animation duration
	const duration = 2000; // 2 seconds for a more dramatic effect
	const startTime = Date.now();
	
	// Animate camera movement
	function animateCamera() {
		const elapsed = Date.now() - startTime;
		const progress = Math.min(elapsed / duration, 1);
		
		// Ease function (cubic)
		const ease = 1 - Math.pow(1 - progress, 3);
		
		// Update camera position
		camera.position.x = startPosition.x + (targetPosition.x - startPosition.x) * ease;
		camera.position.y = startPosition.y + (targetPosition.y - startPosition.y) * ease;
		camera.position.z = startPosition.z + (targetPosition.z - startPosition.z) * ease;
		
		// Update controls target
		controls.target.x = startLookAt.x + (lookAt.x - startLookAt.x) * ease;
		controls.target.y = startLookAt.y + (lookAt.y - startLookAt.y) * ease;
		controls.target.z = startLookAt.z + (lookAt.z - startLookAt.z) * ease;
		
		// Update controls
		controls.update();
		
		// Force renderer update
		if (renderer && scene) {
			renderer.render(scene, camera);
		}
		
		// Continue animation if not done
		if (progress < 1) {
			requestAnimationFrame(animateCamera);
		}
	}
	
	// Start animation
	animateCamera();
}

/**
 * Request the initial game state from the server
 */
function requestInitialGameState() {
	console.log('Requesting initial game state from server...');
	
	// Make sure we're connected
	if (!NetworkManager.isConnected() || !NetworkManager.getGameId()) {
		console.error('Cannot request game state - not connected or no game ID');
		startFirstTurn(); // Fall back to local game
		resetCamera(true);
		return;
	}
	
	// Show loading message
	showToastMessage('Loading game state...');
	
	// Send request to server
	NetworkManager.sendMessage('get_game_state', {
		gameId: NetworkManager.getGameId()
	}, function(response) {
		if (response && response.success) {
			console.log('Received initial game state:', response);
			
			// Apply the received game state
			applyServerGameState(response.gameState || response);
			
			// Focus camera on player area
			focusCameraOnPlayerArea();
		} else {
			console.error('Failed to get initial game state:', response?.error || 'Unknown error');
			// Fall back to local game
			startFirstTurn();
			resetCamera(true);
		}
	});
	
	// Set a timeout to start local game if server doesn't respond
	setTimeout(() => {
		// Check if we're still waiting (null phase) 
		if (gameState.turnPhase === null) {
			console.warn('Server did not respond with game state in time, starting local game');
			startFirstTurn();
			resetCamera(true);
		}
	}, 5000); // 5 second timeout
}

/**
 * Apply game state received from server
 * @param {Object} serverState - Game state from server
 */
function applyServerGameState(serverState) {
	console.log('Applying server game state:', serverState);
	
	// Make sure we have a valid response object
	if (!serverState) {
		console.error('Invalid server state received');
		return false;
	}
	
	// The server response might have the state nested in different ways:
	// 1. { state: { board: [...], ... } }
	// 2. { gameState: { board: [...], ... } }
	// 3. { board: [...], ... } (direct)
	
	// Extract the actual game state object
	let state = serverState;
	
	if (serverState.state) {
		// Format 1: Extract from state property
		console.log('Found state property in response');
		state = serverState.state;
	} else if (serverState.gameState) {
		// Format 2: Extract from gameState property
		console.log('Found gameState property in response');
		state = serverState.gameState;
	}
	
	console.log('Extracted state object:', state);
	
	// Check if we have valid board data
	if (!state.board) {
		console.warn('No board data in state object');
		
		// Show toast message
		showToastMessage('No board data received from server');
		
		// If no board but we have valid game ID, request full state again
		if (NetworkManager.isConnected() && NetworkManager.getGameId()) {
			setTimeout(() => requestExplicitGameState(), 1000);
		}
		return false;
	}
	
	// Log board dimensions for debugging
	console.log(`Board dimensions: ${state.board.length}x${state.board[0]?.length || 0}`);
	
	// Update board - keep as is, directly using server data including home zones
	gameState.board = state.board;
	
	// If home zones are explicitly provided, store them separately
	if (state.homeZones) {
		gameState.homeZones = state.homeZones;
		console.log('Home zones information received from server:', state.homeZones);
	}
	
	// If board size is set in the state, update our local value
	if (state.boardSize) {
		gameState.boardSize = state.boardSize;
		console.log(`Updated board size to ${state.boardSize}`);
	}
	
	// Recreate board visualization
	createBoard();
	
	// Update chess pieces - CRITICAL FIX HERE
	if (state.chessPieces) {
		// Debug log the chess pieces data structure
		console.log('Chess pieces data received:', JSON.stringify(state.chessPieces));
		
		// Ensure pieces have all required properties
		const validatedPieces = state.chessPieces.map(piece => {
			// Check for required properties
			if (!piece.type || piece.x === undefined || piece.z === undefined || piece.player === undefined) {
				console.warn('Invalid chess piece data:', piece);
				return null;
			}
			return piece;
		}).filter(piece => piece !== null);
		
		console.log(`Validated ${validatedPieces.length} chess pieces out of ${state.chessPieces.length}`);
		
		// Update game state with valid pieces
		gameState.chessPieces = validatedPieces;
		
		// Update chess pieces visualization
		updateChessPieces();
		
		// Log how many pieces were actually created in the scene
		const chessPiecesInScene = chessPiecesGroup.children.length;
		console.log(`Created ${chessPiecesInScene} chess piece objects in the scene`);
	} else {
		console.warn('No chess pieces in state object');
	}
	
	// Update current player
	if (state.currentPlayer !== undefined) {
		gameState.currentPlayer = state.currentPlayer;
		console.log(`Updated current player to ${state.currentPlayer}`);
	}
	
	// Update turn phase
	if (state.turnPhase !== undefined) {
		gameState.turnPhase = state.turnPhase;
		console.log(`Updated turn phase to ${state.turnPhase}`);
	} else if (gameState.turnPhase === null || gameState.turnPhase === undefined) {
		// Default to tetris phase if not specified
		gameState.turnPhase = 'tetris';
		console.log('Setting default turn phase to tetris');
	}
	
	// Create tetromino if in tetris phase and none exists
	if (gameState.turnPhase === 'tetris' && !gameState.currentTetromino) {
		console.log('Creating new tetromino');
		createNewTetromino();
	}
	
	// Update game status display
	updateGameStatusDisplay();
	
	// Show toast notification
	showToastMessage(`Game state updated. You are Player ${gameState.currentPlayer} in ${gameState.turnPhase} phase.`);
	
	// Check for computer players now that we have updated state
	checkAndActivateComputerPlayers();
	
	return true;
}

/**
 * Handle UI element clicks
 * @param {MouseEvent} event - Mouse event
 * @returns {boolean} - Whether the click was handled by a UI element
 */
function handleUIElementClick(event) {
	// Check if we clicked on any UI overlay elements (by class or ID)
	const uiElements = [
		'toast-container', 
		'game-status', 
		'network-status', 
		'player-sidebar',
		'debug-controls',
		'tutorial-message',
		'connection-loading-message'
	];
	
	// Check if we clicked on any of the known UI elements
	for (const elementId of uiElements) {
		const element = document.getElementById(elementId);
		if (element && element.contains(event.target)) {
			console.log(`UI element clicked: ${elementId}`);
			return true;
		}
	}
	
	// Also check based on class names
	const classList = event.target.classList;
	if (classList && 
		(classList.contains('control-btn') || 
		 classList.contains('ui-element') ||
		 classList.contains('btn'))) {
		console.log('UI button clicked:', event.target);
		return true;
	}
	
	// No UI element was clicked
	return false;
}

/**
 * Handle UI click in 3D scene
 * @param {THREE.Raycaster} raycaster - Raycaster for collision detection
 * @returns {boolean} - Whether a UI element was clicked
 */
function handleUIClick(raycaster) {
	// Check for UI elements in the 3D scene (like buttons)
	const uiElements = scene.children.filter(child => 
		child.userData && child.userData.type === 'ui-element');
	
	if (uiElements.length === 0) return false;
	
	const intersects = raycaster.intersectObjects(uiElements, true);
	
	if (intersects.length > 0) {
		const element = intersects[0].object;
		
		// Handle based on element ID
		if (element.userData && element.userData.id) {
			console.log(`3D UI element clicked: ${element.userData.id}`);
			
			switch (element.userData.id) {
				case 'start-button':
					startPlayingGame();
					return true;
				
				case 'reset-camera':
					resetCamera(true);
					return true;
					
				default:
					console.log(`Unhandled 3D UI element: ${element.userData.id}`);
					return true;
			}
		}
		
		return true;
	}
	
	return false;
}

/**
 * Show explosion animation at given position
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 */
function showExplosionAnimation(x, z) {
	console.log(`Showing explosion animation at (${x}, ${z})`);
	
	// Offset for centering board
	const offsetX = gameState.boardSize / 2 - 0.5;
	const offsetZ = gameState.boardSize / 2 - 0.5;
	
	// Create particle system
	const particleCount = 50;
	const particleGroup = new THREE.Group();
	particleGroup.name = 'explosionEffect';
	scene.add(particleGroup);
	
	// Create particles
	for (let i = 0; i < particleCount; i++) {
		const size = Math.random() * 0.3 + 0.1;
		const geometry = new THREE.BoxGeometry(size, size, size);
		const material = new THREE.MeshBasicMaterial({
			color: 0xFF5500,
			transparent: true,
			opacity: 0.8
		});
		
		const particle = new THREE.Mesh(geometry, material);
		
		// Position at explosion center
		particle.position.set(
			x - offsetX,
			0.5, // Just above the board
			z - offsetZ
		);
		
		// Add random velocity
		particle.userData.velocity = {
			x: (Math.random() - 0.5) * 0.3,
			y: Math.random() * 0.5,
			z: (Math.random() - 0.5) * 0.3
		};
		
		// Add random rotation
		particle.userData.rotation = {
			x: (Math.random() - 0.5) * 0.2,
			y: (Math.random() - 0.5) * 0.2,
			z: (Math.random() - 0.5) * 0.2
		};
		
		particleGroup.add(particle);
	}
	
	// Animation lifetime
	const duration = 1000; // 1 second
	const startTime = Date.now();
	
	// Animate the particles
	function animateExplosion() {
		const elapsed = Date.now() - startTime;
		const progress = elapsed / duration;
		
		// Update particles
		for (let i = 0; i < particleGroup.children.length; i++) {
			const particle = particleGroup.children[i];
			
			// Update position
			particle.position.x += particle.userData.velocity.x;
			particle.position.y += particle.userData.velocity.y;
			particle.position.z += particle.userData.velocity.z;
			
			// Apply gravity
			particle.userData.velocity.y -= 0.01;
			
			// Update rotation
			particle.rotation.x += particle.userData.rotation.x;
			particle.rotation.y += particle.userData.rotation.y;
			particle.rotation.z += particle.userData.rotation.z;
			
			// Fade out
			particle.material.opacity = 0.8 * (1 - progress);
		}
		
		// Continue animation if not complete
		if (progress < 1) {
			requestAnimationFrame(animateExplosion);
		} else {
			// Remove particle system when done
			scene.remove(particleGroup);
			
			// Dispose geometries and materials
			particleGroup.children.forEach(particle => {
				particle.geometry.dispose();
				particle.material.dispose();
			});
		}
	}
	
	// Start animation
	animateExplosion();
}

/**
 * Pause the game (used when network connection is lost)
 */
export function pauseGame() {
	console.log('Pausing game due to network disconnection');
	
	// If we're already in a paused state, don't do anything
	if (gameState.isPaused) {
		return;
	}
	
	// Set pause flag
	gameState.isPaused = true;
	
	// Add semi-transparent overlay to indicate paused state
	const gameContainer = document.getElementById('game-container');
	let pauseOverlay = document.getElementById('pause-overlay');
	
	if (!pauseOverlay) {
		pauseOverlay = document.createElement('div');
		pauseOverlay.id = 'pause-overlay';
		pauseOverlay.style.position = 'absolute';
		pauseOverlay.style.top = '0';
		pauseOverlay.style.left = '0';
		pauseOverlay.style.width = '100%';
		pauseOverlay.style.height = '100%';
		pauseOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
		pauseOverlay.style.display = 'flex';
		pauseOverlay.style.justifyContent = 'center';
		pauseOverlay.style.alignItems = 'center';
		pauseOverlay.style.zIndex = '100';
		pauseOverlay.style.color = 'white';
		pauseOverlay.style.fontSize = '24px';
		pauseOverlay.innerHTML = '<div>Game Paused - Waiting for network connection</div>';
		
		gameContainer.appendChild(pauseOverlay);
	} else {
		pauseOverlay.style.display = 'flex';
	}
	
	// Stop any active game loops or animations
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
}

/**
 * Resume the game (used when network connection is restored)
 */
export function resumeGame() {
	console.log('Resuming game after network reconnection');
	
	// If we're not in a paused state, don't do anything
	if (!gameState.isPaused) {
		return;
	}
	
	// Clear pause flag
	gameState.isPaused = false;
	
	// Remove the pause overlay
	const pauseOverlay = document.getElementById('pause-overlay');
	if (pauseOverlay) {
		pauseOverlay.style.display = 'none';
	}
	
	// Restart the animation loop
	if (!animationFrameId) {
		animationFrameId = requestAnimationFrame(animate);
	}
}

/**
 * Reset the game to initial state
 */
export function resetGame() {
	console.log('Resetting game to initial state');
	resetGameState();
	restartGame();
	resetCamera(true);
}

// Export the functions
export { 
	placeTetromino, 
};

/**
 * Toggle debug mode
 * @param {boolean} enabled - Whether debug mode should be enabled
 */
export function toggleDebug(enabled = null) {
	// If no value provided, toggle current value
	if (enabled === null) {
		gameState.debugMode = !gameState.debugMode;
	} else {
		gameState.debugMode = enabled;
	}
	
	console.log(`Debug mode ${gameState.debugMode ? 'enabled' : 'disabled'}`);
	
	// Update UI if debug panel exists
	const debugPanel = document.getElementById('debug-panel');
	if (debugPanel) {
		debugPanel.style.display = gameState.debugMode ? 'block' : 'none';
	}
}