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
	
	// Create proper home island area (8x2 area at the bottom)
	// Home zone for first player (rows 15-16, columns 8-15)
	for (let z = 15; z <= 16; z++) {
		for (let x = 8; x <= 15; x++) {
			testBoard[z][x] = {
				type: 'cell',
				active: true,
				playerId: testPlayerId,
				isHomeZone: true,  // Mark as home zone
				color: 0xFFA500,   // Orange color for home zone
				chessPiece: null    // Will add chess pieces later
			};
		}
	}
	
	// Create a path from home zone to other areas
	for (let z = 10; z < 15; z++) {
		for (let x = 10; x < 15; x++) {
			testBoard[z][x] = {
				type: 'cell',
				active: true,
				playerId: testPlayerId,
				isHomeZone: false,
				color: 0x42A5F5, // Blue color for regular cells
				chessPiece: null
			};
		}
	}
	
	// Add some additional cells as test terrain
	for (let z = 5; z < 10; z++) {
		for (let x = 5; x < 18; x++) {
			if ((x + z) % 3 === 0) { // Create a pattern with gaps
				testBoard[z][x] = {
					type: 'cell',
					active: true,
					playerId: testPlayerId,
					isHomeZone: false,
					color: 0x7986CB, // Indigo color
					chessPiece: null
				};
			}
		}
	}
	
	// Add chess pieces to home zone in proper arrangement
	// First row (back row - rook, knight, bishop, queen, king, bishop, knight, rook)
	const backRow = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
	for (let i = 0; i < 8; i++) {
		testBoard[16][8 + i] = {
			type: 'cell',
			active: true,
			playerId: testPlayerId,
			isHomeZone: true,
			color: 0xFFA500, // Orange home zone
			chessPiece: {
				type: backRow[i],
				owner: testPlayerId
			}
		};
	}
	
	// Second row (all pawns)
	for (let i = 0; i < 8; i++) {
		testBoard[15][8 + i] = {
			type: 'cell',
			active: true,
			playerId: testPlayerId,
			isHomeZone: true,
			color: 0xFFA500, // Orange home zone
			chessPiece: {
				type: 'pawn',
				owner: testPlayerId
			}
		};
	}
	
	// Add some advanced pieces on the battlefield for testing
	// A knight that has moved forward
	testBoard[12][12] = {
		type: 'cell',
		active: true,
		playerId: testPlayerId,
		color: 0x42A5F5,
		chessPiece: {
			type: 'knight',
			owner: testPlayerId
		}
	};
	
	// A pawn that has moved forward
	testBoard[8][10] = {
		type: 'cell',
		active: true,
		playerId: testPlayerId,
		color: 0x42A5F5,
		chessPiece: {
			type: 'pawn',
			owner: testPlayerId
		}
	};
	
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
		},
		fallingPiece: {
			type: 'T',  // T-shaped tetromino
			position: { x: 12, z: 3, y: 5 }, // Higher up so it's visible
			rotation: 0
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
			// Add animation to falling piece
			if (cachedGameState.fallingPiece) {
				// Make the piece fall slowly
				cachedGameState.fallingPiece.position.y -= 0.03;
				
				// Reset when it gets too low
				if (cachedGameState.fallingPiece.position.y < -2) {
					cachedGameState.fallingPiece.position.y = 5;
					
					// Move X position for variety
					cachedGameState.fallingPiece.position.x = 8 + Math.floor(Math.random() * 8);
					
					// Change tetromino type
					const types = ['I', 'O', 'T', 'J', 'L', 'S', 'Z'];
					cachedGameState.fallingPiece.type = types[Math.floor(Math.random() * types.length)];
					
					// Random rotation
					cachedGameState.fallingPiece.rotation = Math.floor(Math.random() * 4) * 90;
				}
			}
			
			// Return the cached state with updated falling piece
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

// Enable some debug logging
if (!window.Constants) {
	window.Constants = {
		DEBUG_LOGGING: true,
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
		console.error('Game container not found - unable to initialize renderer');
		
		// Try to update the info panel to show the error
		try {
			const infoPanel = document.getElementById('info-panel');
			if (infoPanel) {
				infoPanel.innerHTML = `
					<h2>Chesstris Game Test</h2>
					<p style="color: red;">ERROR: Game container element not found!</p>
					<p>Please check the HTML for an element with id="game-container".</p>
				`;
			}
		} catch (e) {
			// If we can't even update the info panel, log to console as a last resort
			console.error('Failed to update info panel:', e);
		}
		
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
				
				// Create a more visible pattern based on texture type
				if (path.includes('board')) {
					// Board texture - wooden pattern
					ctx.fillStyle = '#8D6E63'; // Brown
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					
					// Wood grain lines
					ctx.strokeStyle = '#5D4037';
					ctx.lineWidth = 2;
					for (let i = 0; i < 20; i++) {
						const y = i * 10 + Math.random() * 5;
						ctx.beginPath();
						ctx.moveTo(0, y);
						ctx.bezierCurveTo(
							canvas.width/3, y + Math.random() * 10 - 5,
							canvas.width*2/3, y + Math.random() * 10 - 5,
							canvas.width, y + Math.random() * 10 - 5
						);
						ctx.stroke();
					}
				} 
				else if (path.includes('cell')) {
					// Cell texture - metallic blue
					ctx.fillStyle = '#2196F3';
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					
					// Highlight
					const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
					gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
					gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
					gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
					ctx.fillStyle = gradient;
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					
					// Grid lines
					ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
					ctx.lineWidth = 1;
					ctx.beginPath();
					for (let i = 0; i <= 4; i++) {
						const pos = i * (canvas.width/4);
						ctx.moveTo(pos, 0);
						ctx.lineTo(pos, canvas.height);
						ctx.moveTo(0, pos);
						ctx.lineTo(canvas.width, pos);
					}
					ctx.stroke();
				}
				else if (path.includes('home')) {
					// Home zone texture - golden pattern
					ctx.fillStyle = '#FFC107'; // Amber
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					
					// Diagonal pattern
					ctx.fillStyle = '#FFD54F';
					for (let i = -canvas.width; i < canvas.width; i += 20) {
						ctx.beginPath();
						ctx.moveTo(i, 0);
						ctx.lineTo(i + canvas.width, canvas.height);
						ctx.lineTo(i + canvas.width + 10, canvas.height);
						ctx.lineTo(i + 10, 0);
						ctx.fill();
					}
				}
				
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
		},
		enableSkybox: true,  // Enable skybox
		enableClouds: true,  // Enable clouds
		enableEffects: true  // Enable additional effects
	});
	
	// Update the info panel if it exists
	const infoPanel = document.getElementById('info-panel');
	if (infoPanel) {
		if (success) {
			infoPanel.innerHTML = `
				<h2>Chesstris Game Test</h2>
				<p>Testing the full game renderer</p>
				<p>Controls: Use mouse to rotate, scroll to zoom</p>
				<p>Debug Controls:</p>
				<ul>
					<li>Press <b>window.resetCamera()</b> in console to reset view</li>
					<li>Press <b>window.topView()</b> for bird's eye view</li>
					<li>Press <b>window.sideView()</b> for side view</li>
				</ul>
				<p>You should see:</p>
				<ul>
					<li>Home zone (orange) with chess pieces</li>
					<li>Blue cells extending outward</li>
					<li>Falling tetromino pieces</li>
					<li>Skybox with clouds</li>
				</ul>
			`;
		} else {
			infoPanel.innerHTML = `
				<h2>Chesstris Game Test</h2>
				<p style="color: red;">Renderer initialization failed!</p>
				<p>Please check the console for error messages.</p>
				<p>The fallback renderer will activate in a few seconds.</p>
			`;
		}
	} else {
		console.warn('Info panel element not found');
	}
	
	isInitialized = true;
	return success;
}

// Function to enable camera controls from the HTML page
function initCameraControls() {
	// Add event listeners for buttons
	document.getElementById('btn-reset-camera')?.addEventListener('click', () => {
		if (window.resetCamera) window.resetCamera();
	});
	
	document.getElementById('btn-top-view')?.addEventListener('click', () => {
		if (window.topView) window.topView();
	});
	
	document.getElementById('btn-side-view')?.addEventListener('click', () => {
		if (window.sideView) window.sideView();
	});
}

// Export the test renderer function for use in the test HTML
export { testRenderer as init, initCameraControls };

// Initialize when the page is loaded
window.addEventListener('DOMContentLoaded', () => {
	console.log('DOM loaded, initializing test renderer...');
	testRenderer();
	initCameraControls();
	
	// Log success message with instructions
	console.log('%c Chesstris Renderer Test Initialized', 'background: #2196F3; color: white; padding: 5px; font-size: 16px; font-weight: bold;');
	console.log('%c Use these commands in console to adjust view:', 'color: #FFC107; font-weight: bold;');
	console.log('window.resetCamera() - Reset camera position');
	console.log('window.topView() - Bird\'s eye view');
	console.log('window.sideView() - Side view');
}); 