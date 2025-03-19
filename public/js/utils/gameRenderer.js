/**
 * Game Renderer Utility
 *
 * Handles rendering of game elements for both 2D and 3D modes
 */

// Constants for rendering
const RENDER_MODES = {
	MODE_2D: '2d',
	MODE_3D: '3d'
};

// Default rendering settings
const DEFAULT_SETTINGS = {
	mode: RENDER_MODES.MODE_3D,
	cellSize: 40,
	boardPadding: 10,
	animationSpeed: 1.0,
	showGrid: true,
	showShadows: true,
	showGhostPiece: true,
	highlightValidMoves: true,
	theme: 'default',
	quality: 'medium'
};

// Current renderer state
let canvas = null;
let context = null;
let renderer = null;
let scene = null;
let camera = null;
let currentMode = null;
let isInitialized = false;
let settings = { ...DEFAULT_SETTINGS };
let currentGameState = null;
let animationFrameId = null;
let controls = null;

/**
 * Initialize the renderer
 * @param {HTMLElement} container - Container element for the renderer
 * @param {Object} options - Renderer options
 * @returns {Promise} Promise that resolves when initialization is complete
 */
export async function init(container, options = {}) {
	try {
		console.log('Initializing game renderer...');
		
		// Apply options
		settings = { ...DEFAULT_SETTINGS, ...options };
		
		// Determine rendering mode
		currentMode = settings.mode || (window.is2DMode ? RENDER_MODES.MODE_2D : RENDER_MODES.MODE_3D);
		console.log(`Using ${currentMode} rendering mode`);
		
		// Create canvas to fill the entire window
		canvas = document.createElement('canvas');
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		canvas.style.position = 'absolute';
		canvas.style.top = '0';
		canvas.style.left = '0';
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		canvas.style.display = 'block'; // Ensure canvas is visible
		canvas.style.zIndex = '1'; // Set proper z-index
		
		// Clear the container before adding the canvas
		container.innerHTML = '';
		container.appendChild(canvas);
		
		// Initialize based on mode
		if (currentMode === RENDER_MODES.MODE_2D) {
			context = canvas.getContext('2d');
		} else {
			// Initialize 3D renderer
			setup3DScene();
		}
		
		// Set up resize handler
		window.addEventListener('resize', handleResize);
		
		// Start render loop
		startRenderLoop();
		
		isInitialized = true;
		console.log('Game renderer initialized');
		
		return true;
	} catch (error) {
		console.error('Error initializing game renderer:', error);
		return false;
	}
}

/**
 * Set up 3D scene
 */
function setup3DScene() {
	// Create scene
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x121212);
	
	// Create camera
	camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
	camera.position.set(15, 15, 15);
	camera.lookAt(0, 0, 0);
	
	// Create renderer
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.shadowMap.enabled = true;
	
	// Add renderer to container
	const container = document.getElementById('game-container');
	if (container) {
		container.appendChild(renderer.domElement);
	} else {
		document.body.appendChild(renderer.domElement);
	}
	
	// Set up orbit controls with full rotation
	controls = new THREE.OrbitControls(camera, renderer.domElement);
	
	// Enable smooth controls
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;
	
	// Enable full rotation in all directions
	controls.minPolarAngle = 0;
	controls.maxPolarAngle = Math.PI;
	controls.enableRotate = true;
	controls.rotateSpeed = 0.5;
	
	// Enable panning
	controls.enablePan = true;
	controls.screenSpacePanning = true;
	controls.panSpeed = 0.5;
	
	// Enable zooming
	controls.enableZoom = true;
	controls.zoomSpeed = 1.0;
	controls.minDistance = 5;
	controls.maxDistance = 50;
	
	// Set initial target to the center of the board
	controls.target.set(4.5, 0, 9.5);
	controls.update();
	
	// Add helper button to reset camera
	addCameraResetButton();
	
	// Add lights
	setupLights();
	
	// Add environment
	setupEnvironment();
	
	// Listen for window resize
	window.addEventListener('resize', onWindowResize);
}

/**
 * Add button to reset camera to default position
 */
function addCameraResetButton() {
	// Create button
	const resetButton = document.createElement('button');
	resetButton.textContent = 'Reset Camera';
	resetButton.style.position = 'absolute';
	resetButton.style.bottom = '10px';
	resetButton.style.right = '10px';
	resetButton.style.zIndex = '1000';
	resetButton.style.padding = '8px 16px';
	resetButton.style.backgroundColor = '#333';
	resetButton.style.color = '#fff';
	resetButton.style.border = 'none';
	resetButton.style.borderRadius = '4px';
	resetButton.style.cursor = 'pointer';
	
	// Add event listener
	resetButton.addEventListener('click', () => {
		// Reset camera position and target
		camera.position.set(15, 15, 15);
		controls.target.set(4.5, 0, 9.5);
		controls.update();
	});
	
	// Add to DOM
	const container = document.getElementById('game-container');
	if (container) {
		container.appendChild(resetButton);
	} else {
		document.body.appendChild(resetButton);
	}
}

/**
 * Set up lights in the 3D scene
 */
function setupLights() {
	// Ambient light
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
	scene.add(ambientLight);
	
	// Directional light (main light)
	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
	directionalLight.position.set(10, 20, 15);
	directionalLight.castShadow = true;
	
	// Adjust shadow camera to cover the scene
	directionalLight.shadow.camera.left = -15;
	directionalLight.shadow.camera.right = 15;
	directionalLight.shadow.camera.top = 15;
	directionalLight.shadow.camera.bottom = -15;
	directionalLight.shadow.camera.near = 0.5;
	directionalLight.shadow.camera.far = 50;
	directionalLight.shadow.mapSize.width = 2048;
	directionalLight.shadow.mapSize.height = 2048;
	
	scene.add(directionalLight);
	
	// Additional lights for better illumination
	const pointLight1 = new THREE.PointLight(0xffffff, 0.5);
	pointLight1.position.set(-10, 15, 10);
	scene.add(pointLight1);
	
	const pointLight2 = new THREE.PointLight(0xffffff, 0.3);
	pointLight2.position.set(15, 5, -10);
	scene.add(pointLight2);
}

/**
 * Set up environment elements in 3D scene
 */
function setupEnvironment() {
	// Board base
	const boardBaseGeometry = new THREE.BoxGeometry(12, 0.5, 22);
	const boardBaseMaterial = new THREE.MeshStandardMaterial({
		color: 0x333333,
		roughness: 0.8,
		metalness: 0.2
	});
	const boardBase = new THREE.Mesh(boardBaseGeometry, boardBaseMaterial);
	boardBase.position.set(4.5, -0.75, 9.5);
	boardBase.receiveShadow = true;
	scene.add(boardBase);
	
	// Board side walls
	const wallMaterial = new THREE.MeshStandardMaterial({
		color: 0x222222,
		roughness: 0.7,
		metalness: 0.3,
		transparent: true,
		opacity: 0.8
	});
	
	// Left wall
	const leftWallGeometry = new THREE.BoxGeometry(0.5, 1, 22);
	const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial);
	leftWall.position.set(-1, 0, 9.5);
	leftWall.receiveShadow = true;
	leftWall.castShadow = true;
	scene.add(leftWall);
	
	// Right wall
	const rightWallGeometry = new THREE.BoxGeometry(0.5, 1, 22);
	const rightWall = new THREE.Mesh(rightWallGeometry, wallMaterial);
	rightWall.position.set(10, 0, 9.5);
	rightWall.receiveShadow = true;
	rightWall.castShadow = true;
	scene.add(rightWall);
	
	// Back wall
	const backWallGeometry = new THREE.BoxGeometry(12, 1, 0.5);
	const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
	backWall.position.set(4.5, 0, -1.5);
	backWall.receiveShadow = true;
	backWall.castShadow = true;
	scene.add(backWall);
	
	// Far wall
	const farWallGeometry = new THREE.BoxGeometry(12, 1, 0.5);
	const farWall = new THREE.Mesh(farWallGeometry, wallMaterial);
	farWall.position.set(4.5, 0, 20.5);
	farWall.receiveShadow = true;
	farWall.castShadow = true;
	scene.add(farWall);
	
	// Floor
	const floorGeometry = new THREE.PlaneGeometry(50, 50);
	const floorMaterial = new THREE.MeshStandardMaterial({
		color: 0x111111,
		roughness: 0.9,
		metalness: 0.1
	});
	const floor = new THREE.Mesh(floorGeometry, floorMaterial);
	floor.rotation.x = -Math.PI / 2;
	floor.position.y = -1;
	floor.receiveShadow = true;
	scene.add(floor);
	
	// Grid on the floor
	const gridHelper = new THREE.GridHelper(50, 50, 0x444444, 0x222222);
	gridHelper.position.y = -0.9;
	scene.add(gridHelper);
}

/**
 * Handle window resize
 */
function handleResize() {
	if (!canvas) return;
	
	// Update canvas size
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	
	if (currentMode === RENDER_MODES.MODE_2D) {
		// No additional setup needed for 2D
	} else if (renderer && camera) {
		// Update renderer size
		renderer.setSize(window.innerWidth, window.innerHeight);
		
		// Update camera aspect ratio
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
	}
}

/**
 * Set the current game state
 * @param {Object} gameState - Game state object
 */
export function setGameState(gameState) {
	currentGameState = gameState;
	// console.log('Game state set');
}

/**
 * Get the current game state
 * @returns {Object} Current game state
 */
export function getGameState() {
	return currentGameState;
}

/**
 * Render in 2D mode
 */
function render2D() {
	if (!context || !canvas) {
		return;
	}
	
	// Clear canvas
	context.clearRect(0, 0, canvas.width, canvas.height);
	
	// Draw background
	context.fillStyle = '#121212';
	context.fillRect(0, 0, canvas.width, canvas.height);
	
	// If we have a game state, render it
	if (currentGameState) {
		renderBoard2D(currentGameState);
	} else {
		// Draw some debug info
		context.fillStyle = '#ffffff';
		context.font = '14px Arial';
		context.fillText('2D Renderer Active - No Game State', 10, 20);
	}
}

/**
 * Render the game board in 2D
 * @param {Object} gameState - Game state object
 */
function renderBoard2D(gameState) {
	try {
		// Calculate board size and position
		const cellSize = settings.cellSize || 30;
		const boardWidth = (gameState.board && gameState.board[0]?.length) || 10;
		const boardHeight = (gameState.board && gameState.board.length) || 20;
		const boardPixelWidth = boardWidth * cellSize;
		const boardPixelHeight = boardHeight * cellSize;
		
		// Calculate board position (centered)
		const boardX = (canvas.width - boardPixelWidth) / 2;
		const boardY = (canvas.height - boardPixelHeight) / 2;
		
		// Draw board background
		context.fillStyle = '#1a1a1a';
		context.fillRect(boardX, boardY, boardPixelWidth, boardPixelHeight);
		
		// Draw grid lines if enabled
		if (settings.showGrid) {
			context.strokeStyle = '#333333';
			context.lineWidth = 1;
			
			// Vertical grid lines
			for (let x = 0; x <= boardWidth; x++) {
				const lineX = boardX + x * cellSize;
				context.beginPath();
				context.moveTo(lineX, boardY);
				context.lineTo(lineX, boardY + boardPixelHeight);
				context.stroke();
			}
			
			// Horizontal grid lines
			for (let y = 0; y <= boardHeight; y++) {
				const lineY = boardY + y * cellSize;
				context.beginPath();
				context.moveTo(boardX, lineY);
				context.lineTo(boardX + boardPixelWidth, lineY);
				context.stroke();
			}
		}
		
		// Draw cells
		if (gameState.board) {
			for (let y = 0; y < boardHeight; y++) {
				for (let x = 0; x < boardWidth; x++) {
					const cell = gameState.board[y][x];
					if (cell) {
						const cellX = boardX + x * cellSize;
						const cellY = boardY + y * cellSize;
						
						// Draw cell
						context.fillStyle = getCellColor2D(cell);
						context.fillRect(cellX, cellY, cellSize, cellSize);
						
						// Draw cell border
						context.strokeStyle = '#000000';
						context.lineWidth = 1;
						context.strokeRect(cellX, cellY, cellSize, cellSize);
					}
				}
			}
		}
		
		// Draw ghost piece if enabled
		if (settings.showGhostPiece && gameState.currentTetromino && gameState.ghostPosition) {
			renderGhostPiece2D(
				gameState.currentTetromino.shape,
				gameState.ghostPosition,
				gameState.currentTetromino.type,
				boardX,
				boardY,
				cellSize
			);
		}
		
		// Draw current tetromino
		if (gameState.currentTetromino) {
			renderTetromino2D(gameState.currentTetromino, boardX, boardY, cellSize);
		}
		
		// Draw chess pieces
		if (gameState.chessPieces) {
			renderChessPieces2D(gameState.chessPieces, boardX, boardY, cellSize);
		}
		
		// Draw UI elements
		renderUI2D(gameState, boardX, boardY, cellSize, boardPixelWidth, boardPixelHeight);
	} catch (error) {
		console.error('Error rendering board in 2D:', error);
	}
}

/**
 * Render tetromino in 2D
 * @param {Object} tetromino - Tetromino object
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderTetromino2D(tetromino, boardX, boardY, cellSize) {
	try {
		const { shape, position, type } = tetromino;
		
		if (!shape || !position) {
			return;
		}
		
		// Draw tetromino blocks
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const worldX = position.x + x;
					const worldY = position.y + y;
					const cellX = boardX + worldX * cellSize;
					const cellY = boardY + worldY * cellSize;
					
					// Draw tetromino cell
					context.fillStyle = getTetrominoColor2D(type);
					context.fillRect(cellX, cellY, cellSize, cellSize);
					
					// Draw cell border
					context.strokeStyle = '#000000';
					context.lineWidth = 1;
					context.strokeRect(cellX, cellY, cellSize, cellSize);
				}
			}
		}
		
		// Draw height indicator
		if (position.z !== undefined && position.z > 0) {
			// Calculate center of tetromino
			let centerX = 0;
			let centerY = 0;
			let blockCount = 0;
			
			for (let y = 0; y < shape.length; y++) {
				for (let x = 0; x < shape[y].length; x++) {
					if (shape[y][x]) {
						centerX += (position.x + x);
						centerY += (position.y + y);
						blockCount++;
					}
				}
			}
			
			if (blockCount > 0) {
				centerX = boardX + (centerX / blockCount) * cellSize + cellSize / 2;
				centerY = boardY + (centerY / blockCount) * cellSize + cellSize / 2;
				
				// Draw height number
				context.fillStyle = '#ffffff';
				context.font = 'bold ' + Math.floor(cellSize * 0.8) + 'px Arial';
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				
				// Background circle for better visibility
				context.beginPath();
				context.arc(centerX, centerY, cellSize * 0.4, 0, Math.PI * 2);
				context.fillStyle = 'rgba(0, 0, 0, 0.7)';
				context.fill();
				
				// Height text
				context.fillStyle = '#ffffff';
				context.fillText(Math.ceil(position.z).toString(), centerX, centerY);
			}
		}
	} catch (error) {
		console.error('Error rendering tetromino in 2D:', error);
	}
}

/**
 * Render ghost piece in 2D
 * @param {Array} shape - Tetromino shape
 * @param {Object} position - Ghost position
 * @param {string|number} type - Tetromino type
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderGhostPiece2D(shape, position, type, boardX, boardY, cellSize) {
	try {
		if (!shape || !position) {
			return;
		}
		
		// Draw ghost tetromino blocks
		for (let y = 0; y < shape.length; y++) {
			for (let x = 0; x < shape[y].length; x++) {
				if (shape[y][x]) {
					const worldX = position.x + x;
					const worldY = position.y + y;
					const cellX = boardX + worldX * cellSize;
					const cellY = boardY + worldY * cellSize;
					
					// Get tetromino color and make it transparent
					const color = getTetrominoColor2D(type);
					const colorValues = color.match(/\d+/g);
					if (colorValues && colorValues.length >= 3) {
						// Draw ghost cell (outline only)
						context.strokeStyle = `rgba(${colorValues[0]}, ${colorValues[1]}, ${colorValues[2]}, 0.5)`;
						context.lineWidth = 2;
						context.strokeRect(cellX + 2, cellY + 2, cellSize - 4, cellSize - 4);
						
						// Add pattern to ghost piece
						context.fillStyle = `rgba(${colorValues[0]}, ${colorValues[1]}, ${colorValues[2]}, 0.2)`;
						context.fillRect(cellX + 2, cellY + 2, cellSize - 4, cellSize - 4);
					}
				}
			}
		}
	} catch (error) {
		console.error('Error rendering ghost piece in 2D:', error);
	}
}

/**
 * Render chess pieces in 2D
 * @param {Array} chessPieces - Chess pieces array
 * @param {number} boardX - Board x position
 * @param {number} boardY - Board y position
 * @param {number} cellSize - Cell size in pixels
 */
function renderChessPieces2D(chessPieces, boardX, boardY, cellSize) {
	try {
		for (const piece of chessPieces) {
			if (!piece || !piece.type || !piece.position) {
				continue;
			}
			
			const { type, position, player } = piece;
			const { x, y } = position;
			
			const pieceX = boardX + x * cellSize;
			const pieceY = boardY + y * cellSize;
			
			// Draw chess piece
			const pieceChar = getChessPieceChar(type, player);
			const color = player === 1 ? '#ffffff' : '#000000';
			const outline = player === 1 ? '#000000' : '#ffffff';
			
			// Draw piece
			context.font = 'bold ' + Math.floor(cellSize * 0.7) + 'px Arial';
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			
			// Draw outline for better visibility
			context.strokeStyle = outline;
			context.lineWidth = 2;
			context.strokeText(pieceChar, pieceX + cellSize / 2, pieceY + cellSize / 2);
			
			// Draw piece
			context.fillStyle = color;
			context.fillText(pieceChar, pieceX + cellSize / 2, pieceY + cellSize / 2);
		}
	} catch (error) {
		console.error('Error rendering chess pieces in 2D:', error);
	}
}

/**
 * Render UI elements in 2D
 */
function renderUI2D(gameState, boardX, boardY, cellSize, boardPixelWidth, boardPixelHeight) {
	try {
		// Draw next tetromino preview
		if (gameState.nextTetromino) {
			const previewX = boardX + boardPixelWidth + 20;
			const previewY = boardY;
			const previewSize = cellSize * 0.8;
			
			// Draw preview box
			context.fillStyle = '#1a1a1a';
			context.fillRect(previewX, previewY, previewSize * 4, previewSize * 4);
			
			// Draw label
			context.fillStyle = '#ffffff';
			context.font = '16px Arial';
			context.textAlign = 'left';
			context.textBaseline = 'top';
			context.fillText('Next:', previewX, previewY - 20);
			
			// Draw next tetromino
			const { shape, type } = gameState.nextTetromino;
			if (shape) {
				// Get tetromino dimensions
				let minX = shape[0].length;
				let minY = shape.length;
				let maxX = 0;
				let maxY = 0;
				
				for (let y = 0; y < shape.length; y++) {
					for (let x = 0; x < shape[y].length; x++) {
						if (shape[y][x]) {
							minX = Math.min(minX, x);
							minY = Math.min(minY, y);
							maxX = Math.max(maxX, x);
							maxY = Math.max(maxY, y);
						}
					}
				}
				
				const tetrominoWidth = maxX - minX + 1;
				const tetrominoHeight = maxY - minY + 1;
				
				// Center tetromino in preview box
				const offsetX = previewX + (4 - tetrominoWidth) * previewSize / 2;
				const offsetY = previewY + (4 - tetrominoHeight) * previewSize / 2;
				
				// Draw tetromino
				for (let y = 0; y < shape.length; y++) {
					for (let x = 0; x < shape[y].length; x++) {
						if (shape[y][x]) {
							const cellX = offsetX + (x - minX) * previewSize;
							const cellY = offsetY + (y - minY) * previewSize;
							
							// Draw cell
							context.fillStyle = getTetrominoColor2D(type);
							context.fillRect(cellX, cellY, previewSize, previewSize);
							
							// Draw cell border
							context.strokeStyle = '#000000';
							context.lineWidth = 1;
							context.strokeRect(cellX, cellY, previewSize, previewSize);
						}
					}
				}
			}
		}
		
		// Draw score and level
		if (gameState.score !== undefined || gameState.level !== undefined) {
			const infoX = boardX;
			const infoY = boardY + boardPixelHeight + 20;
			
			context.fillStyle = '#ffffff';
			context.font = '16px Arial';
			context.textAlign = 'left';
			context.textBaseline = 'top';
			
			if (gameState.score !== undefined) {
				context.fillText(`Score: ${gameState.score}`, infoX, infoY);
			}
			
			if (gameState.level !== undefined) {
				context.fillText(`Level: ${gameState.level}`, infoX, infoY + 25);
			}
		}
	} catch (error) {
		console.error('Error rendering UI in 2D:', error);
	}
}

/**
 * Get character for chess piece
 * @param {string} type - Piece type
 * @param {number} player - Player number
 * @returns {string} Chess piece character
 */
function getChessPieceChar(type, player) {
	const pieces = {
		'pawn': '♟',
		'knight': '♞',
		'bishop': '♝',
		'rook': '♜',
		'queen': '♛',
		'king': '♚'
	};
	
	return pieces[type.toLowerCase()] || '?';
}

/**
 * Get color for a cell in 2D
 * @param {number|string} cell - Cell value
 * @returns {string} Color as CSS color string
 */
function getCellColor2D(cell) {
	// Default colors for different cell types
	const colors = {
		1: 'rgb(0, 255, 255)', // Cyan (I)
		2: 'rgb(255, 255, 0)', // Yellow (O)
		3: 'rgb(128, 0, 128)', // Purple (T)
		4: 'rgb(0, 255, 0)',   // Green (S)
		5: 'rgb(255, 0, 0)',   // Red (Z)
		6: 'rgb(0, 0, 255)',   // Blue (J)
		7: 'rgb(255, 127, 0)', // Orange (L)
		'p1': 'rgb(50, 50, 150)', // Player 1 home zone
		'p2': 'rgb(150, 50, 50)',  // Player 2 home zone
		'wall': 'rgb(50, 50, 50)'  // Wall
	};
	
	// If cell is an object with a type property, use that
	if (typeof cell === 'object' && cell.type) {
		return colors[cell.type] || 'rgb(150, 150, 150)';
	}
	
	// Otherwise use the cell value directly
	return colors[cell] || 'rgb(150, 150, 150)';
}

/**
 * Get color for a tetromino in 2D
 * @param {number|string} type - Tetromino type
 * @returns {string} Color as CSS color string
 */
function getTetrominoColor2D(type) {
	const colors = {
		'I': 'rgb(0, 255, 255)', // Cyan
		'O': 'rgb(255, 255, 0)', // Yellow
		'T': 'rgb(128, 0, 128)', // Purple
		'S': 'rgb(0, 255, 0)',   // Green
		'Z': 'rgb(255, 0, 0)',   // Red
		'J': 'rgb(0, 0, 255)',   // Blue
		'L': 'rgb(255, 127, 0)', // Orange
		1: 'rgb(0, 255, 255)',   // Cyan (I)
		2: 'rgb(255, 255, 0)',   // Yellow (O)
		3: 'rgb(128, 0, 128)',   // Purple (T)
		4: 'rgb(0, 255, 0)',     // Green (S)
		5: 'rgb(255, 0, 0)',     // Red (Z)
		6: 'rgb(0, 0, 255)',     // Blue (J)
		7: 'rgb(255, 127, 0)'    // Orange (L)
	};
	
	return colors[type] || 'rgb(150, 150, 150)';
}

/**
 * Render in 3D mode
 */
function render3D() {
	if (!renderer || !scene || !camera) {
		return;
	}
	
	// Update controls
	if (controls) {
		controls.update();
	}
	
	// Render the scene
	renderer.render(scene, camera);
	
	// If we have a game state, render it
	if (currentGameState) {
		renderBoard3D(currentGameState);
	}
}

/**
 * Clear 3D objects from scene
 * @param {string} prefix - Prefix of objects to clear
 */
function clearObjectsFromScene(prefix) {
	// Find all objects that start with the prefix
	const objectsToRemove = [];
	scene.traverse((object) => {
		if (object.name && object.name.startsWith(prefix)) {
			objectsToRemove.push(object);
		}
	});
	
	// Remove objects and dispose of geometries/materials
	objectsToRemove.forEach((object) => {
		scene.remove(object);
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
}

/**
 * Render the game board in 3D
 * @param {Object} gameState - Game state object
 */
function renderBoard3D(gameState) {
	try {
		// Clear existing objects
		clearObjectsFromScene('cell_');
		clearObjectsFromScene('tetromino_');
		clearObjectsFromScene('ghost_');
		clearObjectsFromScene('chess_');
		
		// Draw board cells
		if (gameState.board) {
			const boardHeight = gameState.board.length;
			const boardWidth = gameState.board[0]?.length || 0;
			
			for (let y = 0; y < boardHeight; y++) {
				for (let x = 0; x < boardWidth; x++) {
					const cell = gameState.board[y][x];
					if (cell) {
						renderCell3D(x, y, 0, cell);
					}
				}
			}
		}
		
		// Draw ghost piece if enabled
		if (settings.showGhostPiece && gameState.currentTetromino && gameState.ghostPosition) {
			renderGhostPiece3D(
				gameState.currentTetromino.shape,
				gameState.ghostPosition,
				gameState.currentTetromino.type
			);
		}
		
		// Draw current tetromino
		if (gameState.currentTetromino) {
			renderTetromino3D(gameState.currentTetromino);
		}
		
		// Draw chess pieces
		if (gameState.chessPieces) {
			renderChessPieces3D(gameState.chessPieces);
		}
	} catch (error) {
		console.error('Error rendering board in 3D:', error);
	}
}

/**
 * Render cell in 3D
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} z - Z position (height)
 * @param {number|string|Object} cellType - Cell type
 */
function renderCell3D(x, y, z, cellType) {
	// Get cell color
	const color = getCellColor3D(cellType);
	
	// Create geometry for cell - make it cubic (equal dimensions)
	const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);
	
	// Create material for cell
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3
	});
	
	// Create mesh for cell
	const cell = new THREE.Mesh(geometry, material);
	cell.position.set(x, y, z); // Now using standard Three.js coordinates
	cell.castShadow = true;
	cell.receiveShadow = true;
	
	// Add cell to scene
	scene.add(cell);
}

/**
 * Render tetromino in 3D
 * @param {Object} tetromino - Tetromino object
 */
function renderTetromino3D(tetromino) {
	const { shape, position, type } = tetromino;
	
	// Get color for tetromino
	const color = getTetrominoColor3D(type);
	
	// Create material for tetromino
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3
	});
	
	// Create cells for tetromino
	for (let y = 0; y < shape.length; y++) {
		for (let x = 0; x < shape[y].length; x++) {
			if (shape[y][x]) {
				// Create geometry for cell - make it cubic
				const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);
				
				// Create mesh for cell
				const cell = new THREE.Mesh(geometry, material);
				
				// Position cell using standard Three.js coordinates
				cell.position.set(
					position.x + x,
					position.y, // Y is now height
					position.z + y
				);
				
				cell.castShadow = true;
				cell.receiveShadow = true;
				
				// Add cell to scene
				scene.add(cell);
			}
		}
	}
}

/**
 * Render ghost piece in 3D
 * @param {Array} shape - Tetromino shape
 * @param {Object} position - Ghost position
 * @param {string|number} type - Tetromino type
 */
function renderGhostPiece3D(shape, position, type) {
	// Get color for tetromino
	const color = getTetrominoColor3D(type);
	
	// Create material for ghost piece (semitransparent)
	const material = new THREE.MeshStandardMaterial({
		color: color,
		roughness: 0.7,
		metalness: 0.3,
		transparent: true,
		opacity: 0.3,
		wireframe: false
	});
	
	// Create cells for ghost piece
	for (let y = 0; y < shape.length; y++) {
		for (let x = 0; x < shape[y].length; x++) {
			if (shape[y][x]) {
				// Create geometry for cell - make it cubic
				const geometry = new THREE.BoxGeometry(0.95, 0.95, 0.95);
				
				// Create mesh for cell
				const cell = new THREE.Mesh(geometry, material);
				
				// Position cell using standard Three.js coordinates
				cell.position.set(
					position.x + x,
					position.y, // Y is now height
					position.z + y
				);
				
				// Add cell to scene
				scene.add(cell);
			}
		}
	}
}

/**
 * Render chess pieces in 3D
 * @param {Array} chessPieces - Chess pieces array
 */
function renderChessPieces3D(chessPieces) {
	try {
		for (const piece of chessPieces) {
			if (!piece || !piece.type || !piece.position) {
				continue;
			}
			
			const { type, position, player } = piece;
			
			// Create chess piece mesh based on type
			const chessPieceMesh = createChessPieceMesh(type, player);
			if (!chessPieceMesh) {
				continue;
			}
			
			// Position the chess piece
			chessPieceMesh.position.set(
				position.x, // X position
				0.5,        // Y position (slightly above the board)
				position.y  // Z position
			);
			
			// Name the chess piece
			chessPieceMesh.name = `chess_${position.x}_${position.y}_${type}_${player}`;
			
			// Add chess piece to scene
			scene.add(chessPieceMesh);
		}
	} catch (error) {
		console.error('Error rendering chess pieces in 3D:', error);
	}
}

/**
 * Create chess piece mesh
 * @param {string} type - Chess piece type
 * @param {number} player - Player number
 * @returns {THREE.Mesh} Chess piece mesh
 */
function createChessPieceMesh(type, player) {
	try {
		// Determine piece color based on player
		const color = player === 1 ? 0xffffff : 0x222222;
		
		// Chess piece material
		const material = new THREE.MeshStandardMaterial({
			color: color,
			roughness: 0.5,
			metalness: 0.7
		});
		
		// Simple shape for each piece type
		let geometry;
		
		switch (type.toLowerCase()) {
			case 'pawn':
				geometry = new THREE.ConeGeometry(0.25, 0.5, 8);
				break;
			case 'rook':
				geometry = new THREE.BoxGeometry(0.4, 0.6, 0.4);
				break;
			case 'knight':
				geometry = new THREE.CylinderGeometry(0.1, 0.3, 0.6, 4);
				break;
			case 'bishop':
				geometry = new THREE.ConeGeometry(0.25, 0.7, 16);
				break;
			case 'queen':
				geometry = new THREE.DodecahedronGeometry(0.35);
				break;
			case 'king':
				// King is a combination of a box and a cross
				const baseGeometry = new THREE.BoxGeometry(0.4, 0.5, 0.4);
				const crossGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.1);
				
				const base = new THREE.Mesh(baseGeometry, material);
				const cross = new THREE.Mesh(crossGeometry, material);
				cross.position.y = 0.4;
				
				const kingGroup = new THREE.Group();
				kingGroup.add(base);
				kingGroup.add(cross);
				
				return kingGroup;
			default:
				// Default to a simple sphere
				geometry = new THREE.SphereGeometry(0.3, 16, 16);
		}
		
		// Create mesh
		const chessPiece = new THREE.Mesh(geometry, material);
		chessPiece.castShadow = true;
		
		return chessPiece;
	} catch (error) {
		console.error('Error creating chess piece mesh:', error);
		return null;
	}
}

/**
 * Get color for a cell in 3D
 * @param {number|string|Object} cell - Cell value
 * @returns {number} Color as hex
 */
function getCellColor3D(cell) {
	// Default colors for different cell types
	const colors = {
		1: 0x00ffff, // Cyan (I)
		2: 0xffff00, // Yellow (O)
		3: 0x800080, // Purple (T)
		4: 0x00ff00, // Green (S)
		5: 0xff0000, // Red (Z)
		6: 0x0000ff, // Blue (J)
		7: 0xff7f00, // Orange (L)
		'p1': 0x3232FF, // Player 1 home zone
		'p2': 0xFF3232, // Player 2 home zone
		'wall': 0x323232 // Wall
	};
	
	// If cell is an object with a type property, use that
	if (typeof cell === 'object' && cell.type) {
		return colors[cell.type] || 0x969696;
	}
	
	// Otherwise use the cell value directly
	return colors[cell] || 0x969696;
}

/**
 * Get color for a tetromino in 3D
 * @param {number|string} type - Tetromino type
 * @returns {number} Color as hex
 */
function getTetrominoColor3D(type) {
	const colors = {
		'I': 0x00ffff, // Cyan
		'O': 0xffff00, // Yellow
		'T': 0x800080, // Purple
		'S': 0x00ff00, // Green
		'Z': 0xff0000, // Red
		'J': 0x0000ff, // Blue
		'L': 0xff7f00, // Orange
		1: 0x00ffff, // Cyan (I)
		2: 0xffff00, // Yellow (O)
		3: 0x800080, // Purple (T)
		4: 0x00ff00, // Green (S)
		5: 0xff0000, // Red (Z)
		6: 0x0000ff, // Blue (J)
		7: 0xff7f00  // Orange (L)
	};
	
	return colors[type] || 0x969696;
}

/**
 * Clean up resources
 */
export function cleanup() {
	try {
		console.log('Cleaning up renderer resources...');
		
		// Stop animation loop
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
		
		// Remove event listeners
		window.removeEventListener('resize', handleResize);
		
		// Clean up Three.js resources
		if (renderer) {
			renderer.dispose();
			renderer = null;
		}
		
		// Remove canvas
		if (canvas && canvas.parentElement) {
			canvas.parentElement.removeChild(canvas);
		}
		
		canvas = null;
		context = null;
		camera = null;
		scene = null;
		currentGameState = null;
		isInitialized = false;
		
		console.log('Game renderer cleaned up');
	} catch (error) {
		console.error('Error cleaning up renderer resources:', error);
	}
}

/**
 * Get current FPS
 * @returns {number} Current FPS
 */
let lastFrameTime = 0;
let fps = 0;

export function getFPS() {
	return fps;
}

/**
 * Start the render loop
 */
function startRenderLoop() {
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
	}
	
	let frameCount = 0;
	let lastFpsUpdateTime = 0;
	
	// Define the render function
	const renderFrame = (timestamp) => {
		try {
			// Calculate FPS
			if (!lastFrameTime) {
				lastFrameTime = timestamp;
			}
			
			const deltaTime = timestamp - lastFrameTime;
			lastFrameTime = timestamp;
			
			// Update FPS every second
			if (timestamp - lastFpsUpdateTime >= 1000) {
				fps = Math.round(frameCount * 1000 / (timestamp - lastFpsUpdateTime));
				frameCount = 0;
				lastFpsUpdateTime = timestamp;
			}
			
			frameCount++;
			
			// Render based on mode
			if (currentMode === RENDER_MODES.MODE_2D) {
				render2D();
			} else {
				render3D();
			}
			
			// Continue the loop
			animationFrameId = requestAnimationFrame(renderFrame);
		} catch (error) {
			console.error('Error in render loop:', error);
			// Continue the loop despite errors
			animationFrameId = requestAnimationFrame(renderFrame);
		}
	};
	
	// Start the loop
	animationFrameId = requestAnimationFrame(renderFrame);
	console.log('Render loop started');
}

/**
 * Handle window resize for 3D scene
 */
function onWindowResize() {
	if (!renderer || !camera) return;
	
	// Update renderer size
	renderer.setSize(window.innerWidth, window.innerHeight);
	
	// Update camera aspect ratio
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
}


