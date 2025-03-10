/**
 * Renderer Test File
 * This file tests the refactored renderer modules
 */

import { init, cleanup } from './index.js';

// Track initialization to prevent multiple init calls
let isInitialized = false;

// Create stub versions of GameState and SessionManager if they don't exist
if (!window.GameState) {
	// Fixed player ID that will match what's used for chess pieces
	const testPlayerId = 'player-4b3a520d'; 
	
	// Create actual board with cells
	const boardSize = 24;
	const testBoard = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
	
	// Create LARGER, HIGH-CONTRAST cells in a more visible pattern
	for (let z = 5; z < 20; z++) {
		for (let x = 5; x < 20; x++) {
			// Create a checkerboard pattern of cells with BRIGHT colors
			if ((x + z) % 2 === 0) {
				testBoard[z][x] = {
					type: 'cell',
					active: true,
					playerId: testPlayerId,
					isHomeZone: z >= 15, // Make some cells home zone
					color: 0xFF5500, // Bright orange color for visibility
					chessPiece: null
				};
			} else {
				// Add the odd cells too for better visibility, in a different color
				testBoard[z][x] = {
					type: 'cell',
					active: true,
					playerId: testPlayerId,
					isHomeZone: false,
					color: 0x00FF00, // Bright green color
					chessPiece: null
				};
			}
		}
	}
	
	// Add LARGER, BRIGHTER chess pieces in multiple rows for better visibility
	const pieceTypes = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
	
	// First row of pieces
	for (let i = 0; i < 6; i++) {
		testBoard[10][7 + i] = {
			type: 'cell',
			active: true,
			playerId: testPlayerId,
			color: 0xFF00FF, // Magenta color for extreme contrast
			chessPiece: {
				type: pieceTypes[i],
				owner: testPlayerId
			}
		};
	}
	
	// Second row of pieces - different types
	for (let i = 0; i < 6; i++) {
		testBoard[12][7 + i] = {
			type: 'cell',
			active: true,
			playerId: testPlayerId,
			color: 0xFFFF00, // Yellow color
			chessPiece: {
				type: pieceTypes[5 - i], // Reverse order
				owner: testPlayerId
			}
		};
	}
	
	// Sample game state with actual board data and players
	const sampleGameState = {
		board: testBoard,
		players: {
			[testPlayerId]: {
				id: testPlayerId,
				name: 'Test Player',
				username: 'Player 822',
				color: 0x2196F3, // Blue color
				score: 100,
				isActive: true
			}
		}
	};
	
	// Cache the game state to avoid creating new pieces each frame
	let cachedGameState = JSON.parse(JSON.stringify(sampleGameState));
	
	window.GameState = {
		initGameState: () => {
			console.log('Initializing stub GameState with test data');
			console.log('Board dimensions:', testBoard.length, 'x', testBoard[0].length);
			return cachedGameState;
		},
		getGameState: () => {
			// Return the cached state to prevent rebuilding pieces each frame
			return cachedGameState;
		},
		updateGameState: (newState) => {
			console.log('Updating stub GameState', newState);
			cachedGameState = newState;
			return newState;
		}
	};
}

if (!window.SessionManager) {
	window.SessionManager = {
		initSession: () => {
			console.log('Initializing stub SessionManager');
			return {
				playerId: 'player-4b3a520d',
				username: 'Player 822',
				walletConnected: false,
				walletAddress: null,
				lastSaved: Date.now()
			};
		},
		getSessionData: () => {
			return {
				playerId: 'player-4b3a520d',
				username: 'Player 822',
				walletConnected: false,
				walletAddress: null,
				lastSaved: Date.now()
			};
		}
	};
}

// Set up fake texture paths to prevent 404 errors
if (!window.TEXTURE_PATHS) {
	window.TEXTURE_PATHS = {
		board: './img/textures/board.png',
		cell: './img/textures/cell.png',
		homeZone: './img/textures/home_zone.png'
	};
}

// Disable excessive logging in test mode
if (!window.Constants) {
	window.Constants = {
		DEBUG_LOGGING: false,
		CELL_SIZE: 1
	};
}

// Test function to verify the refactored renderer
function testRenderer() {
	// Prevent multiple initializations
	if (isInitialized) {
		console.log('Renderer already initialized, skipping');
		return true;
	}
	
	console.log('Testing refactored renderer...');
	
	// Get container element
	const container = document.getElementById('game-container');
	if (!container) {
		console.error('Game container not found');
		return false;
	}
	
	// Create test assets directory
	if (!window.TEXTURE_LOADER) {
		window.TEXTURE_LOADER = {
			load: function(path, onLoad) {
				console.log('Mock loading texture:', path);
				// Create a dummy canvas texture
				const canvas = document.createElement('canvas');
				canvas.width = 128;
				canvas.height = 128;
				const ctx = canvas.getContext('2d');
				
				// Create a more visible high-contrast checkerboard pattern
				const squareSize = 16; // Smaller squares for more contrast
				for (let y = 0; y < canvas.height; y += squareSize) {
					for (let x = 0; x < canvas.width; x += squareSize) {
						ctx.fillStyle = (x + y) % (squareSize * 2) === 0 ? '#FF0000' : '#FFFF00';
						ctx.fillRect(x, y, squareSize, squareSize);
					}
				}
				
				// Add a border
				ctx.strokeStyle = '#FFFFFF';
				ctx.lineWidth = 8;
				ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
				
				// Add text label
				ctx.fillStyle = '#000000';
				ctx.font = 'bold 20px Arial';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				
				// Write the texture name
				let textureName = 'Unknown';
				if (path.includes('board')) textureName = 'BOARD';
				else if (path.includes('cell')) textureName = 'CELL';
				else if (path.includes('home')) textureName = 'HOME';
				
				ctx.fillText(textureName, canvas.width/2, canvas.height/2);
				
				// Create a texture from canvas
				const texture = new THREE.CanvasTexture(canvas);
				
				// Call onLoad callback
				if (typeof onLoad === 'function') {
					setTimeout(() => onLoad(texture), 10);
				}
				
				return texture;
			}
		};
	}
	
	// Initialize renderer with test options
	const success = init(container, {
		useTestMode: true,
		debug: true,
		textureLoader: window.TEXTURE_LOADER,
		cameraOptions: {
			position: { x: 12, y: 15, z: 20 },
			lookAt: { x: 12, y: 0, z: 12 }
		}
	});
	
	// If initialization fails or even if it succeeds, create a direct debug object
	// to ensure something is visible
	const createDebugObjects = () => {
		console.log('Creating direct debug objects');
		if (window.scene) {
			// Create a manual grid instead of using GridHelper since it might not be available
			const gridSize = 40;
			const gridDivisions = 40;
			const gridMaterial = new THREE.LineBasicMaterial({ color: 0xFF0000 });
			
			// Create grid lines manually
			const gridGroup = new THREE.Group();
			
			// Create X lines (along Z axis)
			for (let i = 0; i <= gridDivisions; i++) {
				const x = (i / gridDivisions) * gridSize - gridSize / 2;
				const geometry = new THREE.Geometry();
				geometry.vertices.push(
					new THREE.Vector3(x, 0, -gridSize / 2),
					new THREE.Vector3(x, 0, gridSize / 2)
				);
				const line = new THREE.Line(geometry, gridMaterial);
				gridGroup.add(line);
			}
			
			// Create Z lines (along X axis)
			for (let i = 0; i <= gridDivisions; i++) {
				const z = (i / gridDivisions) * gridSize - gridSize / 2;
				const geometry = new THREE.Geometry();
				geometry.vertices.push(
					new THREE.Vector3(-gridSize / 2, 0, z),
					new THREE.Vector3(gridSize / 2, 0, z)
				);
				const line = new THREE.Line(geometry, gridMaterial);
				gridGroup.add(line);
			}
			
			// Center the grid
			gridGroup.position.set(gridSize / 2, 0, gridSize / 2);
			window.scene.add(gridGroup);
			
			// Create visible debug cubes at the test cell positions
			for (let z = 5; z < 20; z+=2) {
				for (let x = 5; x < 20; x+=2) {
					const geometry = new THREE.BoxGeometry(1, 1, 1);
					const material = new THREE.MeshBasicMaterial({ 
						color: ((x + z) % 4 === 0) ? 0xFF0000 : 0x00FF00,
						wireframe: true
					});
					const cube = new THREE.Mesh(geometry, material);
					cube.position.set(x, 0.5, z);
					window.scene.add(cube);
				}
			}
			
			// Add a large marker at the origin
			const originMarker = new THREE.Mesh(
				new THREE.SphereGeometry(1, 16, 16),
				new THREE.MeshBasicMaterial({ color: 0x0000FF })
			);
			originMarker.position.set(0, 1, 0);
			window.scene.add(originMarker);
			
			// Create colored material lines to mark X, Y, Z directions
			// X axis - red
			const xAxisGeo = new THREE.Geometry();
			xAxisGeo.vertices.push(
				new THREE.Vector3(0, 0, 0),
				new THREE.Vector3(10, 0, 0)
			);
			const xAxisLine = new THREE.Line(
				xAxisGeo, 
				new THREE.LineBasicMaterial({ color: 0xFF0000, linewidth: 3 })
			);
			window.scene.add(xAxisLine);
			
			// Y axis - green
			const yAxisGeo = new THREE.Geometry();
			yAxisGeo.vertices.push(
				new THREE.Vector3(0, 0, 0),
				new THREE.Vector3(0, 10, 0)
			);
			const yAxisLine = new THREE.Line(
				yAxisGeo, 
				new THREE.LineBasicMaterial({ color: 0x00FF00, linewidth: 3 })
			);
			window.scene.add(yAxisLine);
			
			// Z axis - blue
			const zAxisGeo = new THREE.Geometry();
			zAxisGeo.vertices.push(
				new THREE.Vector3(0, 0, 0),
				new THREE.Vector3(0, 0, 10)
			);
			const zAxisLine = new THREE.Line(
				zAxisGeo, 
				new THREE.LineBasicMaterial({ color: 0x0000FF, linewidth: 3 })
			);
			window.scene.add(zAxisLine);
			
			// Add text labels at key positions
			const createTextSprite = (text, x, y, z, color = 0xFFFFFF) => {
				const canvas = document.createElement('canvas');
				canvas.width = 256;
				canvas.height = 128;
				const ctx = canvas.getContext('2d');
				
				// Background
				ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				
				// Text
				ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
				ctx.font = 'bold 48px Arial';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(text, canvas.width/2, canvas.height/2);
				
				// Create sprite
				const texture = new THREE.CanvasTexture(canvas);
				const material = new THREE.SpriteMaterial({ map: texture });
				const sprite = new THREE.Sprite(material);
				sprite.position.set(x, y, z);
				sprite.scale.set(5, 2.5, 1);
				window.scene.add(sprite);
				return sprite;
			};
			
			// Add labels at key points
			createTextSprite('ORIGIN', 0, 3, 0, 0xFFFF00);
			createTextSprite('BOARD AREA', 12, 5, 12, 0x00FFFF);
			createTextSprite('PIECES HERE', 10, 3, 10, 0xFF00FF);
			
			console.log('Debug objects created');
		} else {
			console.error('Scene not available for debug objects');
		}
	};
	
	if (!success) {
		console.error('Failed to initialize renderer');
		// Create a minimal renderer if the main one failed
		const scene = new THREE.Scene();
		window.scene = scene;
		
		// Create camera
		const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
		camera.position.set(12, 15, 12);
		camera.lookAt(12, 0, 12);
		window.camera = camera;
		
		// Create renderer
		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setSize(container.clientWidth, container.clientHeight);
		container.appendChild(renderer.domElement);
		window.renderer = renderer;
		
		// Create controls
		const controls = new THREE.OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		window.controls = controls;
		
		// Add debug objects
		createDebugObjects();
		
		// Animation function
		function animate() {
			requestAnimationFrame(animate);
			controls.update();
			renderer.render(scene, camera);
		}
		animate();
		
		return false;
	}
	
	console.log('Renderer initialized successfully');
	isInitialized = true;
	
	// Add debug objects even with successful initialization
	createDebugObjects();
	
	// Position camera to view test cells after a short delay to ensure everything is loaded
	setTimeout(() => {
		if (window.camera) {
			// Position camera for optimal viewing of test cells
			window.camera.position.set(12, 15, 12); // More directly overhead
			window.camera.lookAt(12, 0, 12);
			console.log('Camera positioned to view test cells');
			
			// Log actual camera position for debugging
			console.log('Camera position:', window.camera.position);
			console.log('If you cannot see any cells, try: window.camera.position.set(12, 15, 12); window.camera.lookAt(12, 0, 12);');
			
			// Add a helper message to show controls in the info panel
			const infoPanel = document.getElementById('info-panel');
			if (infoPanel) {
				infoPanel.innerHTML = '<h2>Chesstris Renderer Test</h2>';
				infoPanel.innerHTML += '<p><strong>You should see:</strong></p>';
				infoPanel.innerHTML += '<p>- An orange/green checkerboard (positions 5-20)</p>';
				infoPanel.innerHTML += '<p>- Magenta and yellow cells with chess pieces</p>';
				infoPanel.innerHTML += '<p>- A red/yellow grid on the ground</p>';
				infoPanel.innerHTML += '<p>Use mouse to rotate, scroll to zoom, and right-click to pan</p>';
			}
		}
	}, 500);
	
	return true;
}

// Export test function
export { testRenderer };

// Auto-run test if this file is loaded directly (but don't run twice)
if (typeof window !== 'undefined' && window.location.pathname.includes('test.html')) {
	// We'll let the HTML file handle this via DOMContentLoaded
} 