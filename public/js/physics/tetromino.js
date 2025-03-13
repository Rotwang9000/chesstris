/**
 * TetrominoPhysics - Physics engine for tetromino pieces in Chesstris
 * 
 * This module handles the physics simulation for tetromino pieces
 * including collision detection, gravity, bouncing, and sticking behavior.
 */

// Import THREE directly from the global scope
const THREE = window.THREE;

// Import our renderer class
import { TetrominoRenderer } from './TetrominoRenderer.js';

export class TetrominoPhysics {
	constructor(renderer) {
		this.renderer = renderer;
		this.activeTetromino = null;
		this.velocity = { x: 0, y: 0, z: 0 };
		this.rotation = { x: 0, y: 0, z: 0 };
		this.isDropping = false;
		this.tetrominoRenderer = null;
		this.dissolvingTetrominos = []; // Track dissolving tetrominos
		
		// Physics constants
		this.constants = {
			GRAVITY: 0.005,
			MIN_VELOCITY: 0.005,
			BOUNCE_FACTOR: 0.3, // Reduced bounce factor
			MAX_SPEED: 0.15,
			DROP_SPEED: 0.3,
			MOVE_SPEED: 0.05, // Reduced for better control
			ROTATION_DAMPING: 0.98,
			GROUND_Y: 0.5,
			GRID_SNAP_THRESHOLD: 0.2, // Threshold for grid snapping
			DISSOLUTION_SPEED: 0.03 // Speed of dissolution effect
		};
		
		// Board state
		this.board = [];
		this.boardSize = 32;
		
		// Shapes of tetrominos
		this.shapes = {
			T: [
				[0, 1, 0],
				[1, 1, 1]
			],
			I: [
				[1, 1, 1, 1]
			],
			O: [
				[1, 1],
				[1, 1]
			],
			L: [
				[1, 0],
				[1, 0],
				[1, 1]
			]
		};
		
		// Colors for tetrominos
		this.colors = [
			0xff0000, // Red
			0x00ff00, // Green
			0x0000ff, // Blue
			0xffff00, // Yellow
			0xff00ff  // Magenta
		];
		
		// Last update time for physics
		this.lastUpdateTime = 0;
		
		// Input state for user control
		this.keyState = {
			left: false,
			right: false,
			forward: false,
			backward: false,
			dropping: false,
			rotating: false
		};

		console.log('TetrominoPhysics initialized with renderer:', renderer);
	}
	
	/**
	 * Initialize the physics engine
	 */
	async init() {
		console.log('TetrominoPhysics.init() called');
		
		// Make sure renderer is available
		if (!this.renderer) {
			throw new Error('Renderer is required for physics initialization');
		}
		
		console.log('Creating TetrominoRenderer...');
		// Create the tetromino renderer
		this.tetrominoRenderer = new TetrominoRenderer(this.renderer);
		
		// Create initial test board
		this.createTestBoard();
		
		// Start physics update loop
		this.startPhysicsLoop();
		
		// Set up keyboard controls
		this.setupKeyboardControls();
		
		console.log('TetrominoPhysics initialization complete');
		return true;
	}
	
	/**
	 * Set up keyboard controls for tetromino movement
	 */
	setupKeyboardControls() {
		console.log('Setting up keyboard controls');
		
		document.addEventListener('keydown', (event) => {
			switch (event.key) {
				case 'ArrowLeft':
					this.keyState.left = true;
					break;
				case 'ArrowRight':
					this.keyState.right = true;
					break;
				case 'ArrowUp':
					this.keyState.forward = true;
					break;
				case 'ArrowDown':
					this.keyState.backward = true;
					break;
				case ' ':
					this.keyState.dropping = true;
					break;
				case 'r':
				case 'R':
					this.keyState.rotating = true;
					break;
				case 'v':
				case 'V':
					this.toggleCamera();
					break;
			}
		});
		
		document.addEventListener('keyup', (event) => {
			switch (event.key) {
				case 'ArrowLeft':
					this.keyState.left = false;
					break;
				case 'ArrowRight':
					this.keyState.right = false;
					break;
				case 'ArrowUp':
					this.keyState.forward = false;
					break;
				case 'ArrowDown':
					this.keyState.backward = false;
					break;
				case ' ':
					this.keyState.dropping = false;
					break;
				case 'r':
				case 'R':
					this.keyState.rotating = false;
					break;
			}
		});
		
		console.log('Keyboard controls set up successfully');
	}
	
	/**
	 * Create a test board for physics testing
	 */
	createTestBoard() {
		// Initialize board with empty cells
		this.board = Array(this.boardSize).fill().map(() => Array(this.boardSize).fill(null));
		
		// Create a central platform
		for (let z = 8; z < 16; z++) {
			for (let x = 8; x < 16; x++) {
				this.board[z][x] = {
					active: true,
					isHomeZone: false,
					color: 0x42A5F5 // Blue
				};
			}
		}
		
		// Add home zone (8x2 area)
		const homeZoneX = 12;
		const homeZoneZ = 20;
		for (let z = homeZoneZ; z < homeZoneZ + 2; z++) {
			for (let x = homeZoneX; x < homeZoneX + 8; x++) {
				this.board[z][x] = {
					active: true,
					isHomeZone: true,
					color: 0xFFA500 // Orange
				};
			}
		}
		
		// Create test obstacles - vertical pillars
		for (let i = 0; i < 4; i++) {
			const pillarX = 18 + i * 2;
			const pillarZ = 10;
			for (let z = pillarZ; z < pillarZ + 4; z++) {
				this.board[z][pillarX] = {
					active: true,
					isHomeZone: false,
					color: 0xE91E63 // Pink
				};
			}
		}
		
		// Render the board
		this.renderer.updateBoard(this.board);
	}
	
	/**
	 * Start the physics update loop
	 */
	startPhysicsLoop() {
		this.lastUpdateTime = performance.now();
		this.updatePhysics();
	}
	
	/**
	 * Main physics update function, called each frame
	 */
	updatePhysics() {
		// Calculate delta time
		const currentTime = performance.now();
		const deltaTime = (currentTime - this.lastUpdateTime) / 1000; // Convert to seconds
		this.lastUpdateTime = currentTime;
		
		// Limit delta time to avoid large jumps
		const limitedDelta = Math.min(deltaTime, 0.1);
		
		// Update dissolving tetrominos
		this.updateDissolvingTetrominos(limitedDelta);
		
		// Update active tetromino physics if one exists
		if (this.activeTetromino) {
			// Apply user input
			this.handleUserInput(limitedDelta);
			
			// Apply gravity
			this.velocity.y -= this.constants.GRAVITY * limitedDelta;
			
			// Apply drop speed if dropping
			if (this.isDropping) {
				this.velocity.y = -this.constants.DROP_SPEED;
			}
			
			// Apply speed limits
			this.applySpeedLimits();
			
			// Calculate new position
			const newPosition = {
				x: this.activeTetromino.position.x + this.velocity.x * limitedDelta,
				y: this.activeTetromino.position.y + this.velocity.y * limitedDelta,
				z: this.activeTetromino.position.z + this.velocity.z * limitedDelta
			};
			
			// Keep within board bounds
			newPosition.x = Math.max(2, Math.min(this.boardSize - 2, newPosition.x));
			newPosition.z = Math.max(2, Math.min(this.boardSize - 2, newPosition.z));
			
			// Check for collisions
			const collisionResult = this.detectCollision(this.activeTetromino, newPosition);
			
			if (collisionResult.collision) {
				if (collisionResult.shouldStick) {
					// Handle sticking to the board
					this.handleTetrominoStick(this.activeTetromino);
				} else if (collisionResult.shouldDissolve) {
					// Handle dissolving when hitting non-edge board cells
					this.startDissolveTetromino(this.activeTetromino);
					this.activeTetromino = null;
					this.scheduleRespawn();
				} else {
					// Handle bouncing
					this.handleBounce(collisionResult.normal);
				}
			} else {
				// No collision, update position
				this.activeTetromino.position.x = newPosition.x;
				this.activeTetromino.position.y = newPosition.y;
				this.activeTetromino.position.z = newPosition.z;
				
				// Apply rotation damping
				this.activeTetromino.rotation.x *= this.constants.ROTATION_DAMPING;
				this.activeTetromino.rotation.z *= this.constants.ROTATION_DAMPING;
				
				// Snap to grid if velocity is small enough
				this.snapToGridIfNeeded();
				
				// If fallen below threshold, respawn
				if (newPosition.y < -20) {
					console.log('Tetromino fell too far, respawning...');
					this.respawnTetromino();
				}
			}
			
			// Update ghost piece to show landing position
			this.updateGhostPiece();
		}
		
		// Continue the loop
		requestAnimationFrame(() => this.updatePhysics());
	}
	
	/**
	 * Apply speed limits to velocity
	 */
	applySpeedLimits() {
		const { MAX_SPEED } = this.constants;
		
		if (Math.abs(this.velocity.x) > MAX_SPEED) {
			this.velocity.x = Math.sign(this.velocity.x) * MAX_SPEED;
		}
		
		if (Math.abs(this.velocity.y) > MAX_SPEED * 2) { // Allow faster vertical drops
			this.velocity.y = Math.sign(this.velocity.y) * MAX_SPEED * 2;
		}
		
		if (Math.abs(this.velocity.z) > MAX_SPEED) {
			this.velocity.z = Math.sign(this.velocity.z) * MAX_SPEED;
		}
	}
	
	/**
	 * Handle user input for tetromino movement
	 */
	handleUserInput(deltaTime) {
		if (!this.activeTetromino) return;
		
		// Store previous velocity for direction changes
		const prevVelocity = {
			x: this.velocity.x,
			z: this.velocity.z
		};
		
		// Get grid-aligned position
		const gridX = Math.round(this.activeTetromino.position.x);
		const gridZ = Math.round(this.activeTetromino.position.z);
		
		// Distance to grid center
		const distToGridX = Math.abs(this.activeTetromino.position.x - gridX);
		const distToGridZ = Math.abs(this.activeTetromino.position.z - gridZ);
		
		// Reset velocities to zero by default
		this.velocity.x = 0;
		this.velocity.z = 0;
		
		// Apply movement based on key states - only move when close to grid point
		const { MOVE_SPEED, GRID_SNAP_THRESHOLD } = this.constants;
		
		if (this.keyState.left && distToGridZ < GRID_SNAP_THRESHOLD) {
			this.velocity.x = -MOVE_SPEED;
			// Force Z position to be exactly on grid
			this.activeTetromino.position.z = gridZ;
		}
		else if (this.keyState.right && distToGridZ < GRID_SNAP_THRESHOLD) {
			this.velocity.x = MOVE_SPEED;
			// Force Z position to be exactly on grid
			this.activeTetromino.position.z = gridZ;
		}
		else if (this.keyState.forward && distToGridX < GRID_SNAP_THRESHOLD) {
			this.velocity.z = -MOVE_SPEED;
			// Force X position to be exactly on grid
			this.activeTetromino.position.x = gridX;
		}
		else if (this.keyState.backward && distToGridX < GRID_SNAP_THRESHOLD) {
			this.velocity.z = MOVE_SPEED;
			// Force X position to be exactly on grid
			this.activeTetromino.position.x = gridX;
		}
		
		// Update dropping state
		this.isDropping = this.keyState.dropping;
		
		// Handle rotation
		if (this.keyState.rotating) {
			this.rotate();
			this.keyState.rotating = false; // Only rotate once per key press
		}
		
		// If significant direction change, ensure we're grid-aligned
		if (Math.sign(prevVelocity.x) !== Math.sign(this.velocity.x) && 
			Math.abs(this.velocity.x) > 0.01) {
			this.activeTetromino.position.z = Math.round(this.activeTetromino.position.z);
		}
		if (Math.sign(prevVelocity.z) !== Math.sign(this.velocity.z) && 
			Math.abs(this.velocity.z) > 0.01) {
			this.activeTetromino.position.x = Math.round(this.activeTetromino.position.x);
		}
	}
	
	/**
	 * Handle bouncing when colliding
	 */
	handleBounce(normal) {
		// Bounce with reduced energy based on the normal
		const { BOUNCE_FACTOR, MIN_VELOCITY } = this.constants;
		
		if (normal.x !== 0) {
			this.velocity.x = -this.velocity.x * BOUNCE_FACTOR;
		}
		
		if (normal.y !== 0) {
			this.velocity.y = -this.velocity.y * BOUNCE_FACTOR;
		}
		
		if (normal.z !== 0) {
			this.velocity.z = -this.velocity.z * BOUNCE_FACTOR;
		}
		
		// No random rotation on bounce - pieces should stay aligned
		
		// If velocity is too low, zero it out
		if (Math.abs(this.velocity.x) < MIN_VELOCITY) this.velocity.x = 0;
		if (Math.abs(this.velocity.y) < MIN_VELOCITY) this.velocity.y = 0;
		if (Math.abs(this.velocity.z) < MIN_VELOCITY) this.velocity.z = 0;
	}
	
	/**
	 * Detect collision between tetromino and board or other tetrominos
	 */
	detectCollision(tetromino, newPosition) {
		if (!tetromino) return { collision: false };
		
		// Check for ground collision
		if (newPosition.y <= this.constants.GROUND_Y) {
			// Check if above the board
			if (this.isAboveBoard(newPosition)) {
				// Check if should stick (at edge) or dissolve (not at edge)
				const shouldStick = this.checkShouldStick(newPosition);
				
				return { 
					collision: true, 
					normal: { x: 0, y: 1, z: 0 },
					shouldStick: shouldStick,
					shouldDissolve: !shouldStick
				};
			}
			
			// Just ground collision
			return { 
				collision: true, 
				normal: { x: 0, y: 1, z: 0 },
				shouldStick: false,
				shouldDissolve: false
			};
		}
		
		// Check collision with other tetrominos (future implementation)
		// This would be added when we support multiple active tetrominos
		
		return { collision: false };
	}
	
	/**
	 * Check if position is above an active board cell
	 */
	isAboveBoard(position) {
		// Convert to board coordinates
		const boardX = Math.floor(position.x);
		const boardZ = Math.floor(position.z);
		
		// Check if within bounds
		if (boardX < 0 || boardX >= this.board.length || boardZ < 0 || boardZ >= this.board[0].length) {
			return false;
		}
		
		// Check if there's an active cell at this position
		return this.board[boardZ][boardX] && this.board[boardZ][boardX].active;
	}
	
	/**
	 * Check if tetromino should stick to the board
	 */
	checkShouldStick(position) {
		// Convert to board coordinates
		const boardX = Math.floor(position.x);
		const boardZ = Math.floor(position.z);
		
		// Check if at the edge of the board
		if (boardX <= 0 || boardX >= this.boardSize - 1 || 
			boardZ <= 0 || boardZ >= this.boardSize - 1) {
			return true;
		}
		
		// Check adjacent cells
		const directions = [
			{ x: 1, z: 0 },
			{ x: -1, z: 0 },
			{ x: 0, z: 1 },
			{ x: 0, z: -1 }
		];
		
		// Check if any adjacent cell is occupied
		for (const dir of directions) {
			const checkX = boardX + dir.x;
			const checkZ = boardZ + dir.z;
			
			// Check bounds
			if (checkX >= 0 && checkX < this.board.length && 
				checkZ >= 0 && checkZ < this.board[0].length) {
				// Check if occupied
				if (this.board[checkZ][checkX] && this.board[checkZ][checkX].active) {
					// Check if this is an edge cell
					if (this.isEdgeCell(checkX, checkZ)) {
						return true;
					}
				}
			}
		}
		
		// Special case for home zone
		return this.board[boardZ] && this.board[boardZ][boardX] && this.board[boardZ][boardX].isHomeZone;
	}
	
	/**
	 * Check if a cell is at the edge of the board
	 */
	isEdgeCell(x, z) {
		// Check if at board edge
		if (x <= 0 || x >= this.boardSize - 1 || z <= 0 || z >= this.boardSize - 1) {
			return true;
		}
		
		// Check if any adjacent cell is empty
		const directions = [
			{ x: 1, z: 0 },
			{ x: -1, z: 0 },
			{ x: 0, z: 1 },
			{ x: 0, z: -1 }
		];
		
		for (const dir of directions) {
			const checkX = x + dir.x;
			const checkZ = z + dir.z;
			
			// Check bounds
			if (checkX >= 0 && checkX < this.board.length && 
				checkZ >= 0 && checkZ < this.board[0].length) {
				// If adjacent cell is empty, this is an edge
				if (!this.board[checkZ][checkX] || !this.board[checkZ][checkX].active) {
					return true;
				}
			}
		}
		
		return false;
	}
	
	/**
	 * Handle sticking a tetromino to the board
	 */
	handleTetrominoStick(tetromino) {
		if (!tetromino) return;
		
		// Get position
		const posX = Math.round(tetromino.position.x);
		const posZ = Math.round(tetromino.position.z);
		
		// Log sticking
		console.log(`Tetromino stuck at (${posX}, ${posZ})`);
		
		// Get the tetromino shape and dimensions
		const shape = tetromino.userData.shape;
		const width = tetromino.userData.width;
		const height = tetromino.userData.height;
		
		// Update board with tetromino cells
		for (let z = 0; z < height; z++) {
			for (let x = 0; x < width; x++) {
				if (shape[z][x]) {
					// Calculate world position
					const worldX = posX + x - Math.floor(width / 2);
					const worldZ = posZ + z - Math.floor(height / 2);
					
					// Update board if within bounds
					if (worldX >= 0 && worldX < this.board.length && 
						worldZ >= 0 && worldZ < this.board[0].length) {
						// Create new cell data
						const tetrominoColor = tetromino.userData.color || 0xff00ff;
						this.board[worldZ][worldX] = {
							active: true,
							isHomeZone: false,
							color: tetrominoColor
						};
					}
				}
			}
		}
		
		// Update the board in the renderer
		this.renderer.updateBoard(this.board);
		
		// Remove active tetromino
		this.tetrominoRenderer.removeTetromino(tetromino);
		this.activeTetromino = null;
		this.isDropping = false;
		
		// Spawn a new tetromino after delay
		setTimeout(() => {
			this.spawnTetromino();
		}, 2000);
	}
	
	/**
	 * Update ghost piece to show landing position
	 */
	updateGhostPiece() {
		this.tetrominoRenderer.updateGhostPiece(
			this.activeTetromino,
			this.constants.GROUND_Y,
			this.board
		);
	}
	
	/**
	 * Spawn a new tetromino
	 */
	spawnTetromino() {
		console.log('Spawning new tetromino');
		
		// Clear any existing tetromino
		if (this.activeTetromino) {
			this.tetrominoRenderer.removeTetromino(this.activeTetromino);
		}
		
		// Select a random shape
		const types = Object.keys(this.shapes);
		const type = types[Math.floor(Math.random() * types.length)];
		const shape = this.shapes[type];
		
		// Random starting position
		const startX = 8 + Math.floor(Math.random() * 8);
		const startZ = 8 + Math.floor(Math.random() * 8);
		
		// Create tetromino with random color
		const color = this.colors[Math.floor(Math.random() * this.colors.length)];
		this.activeTetromino = this.tetrominoRenderer.createTetromino(shape, color, {
			type: type,
			width: shape[0].length,
			height: shape.length,
			color: color
		});
		
		// Set starting position
		this.activeTetromino.position.set(startX, 10, startZ);
		
		// Reset velocity and rotation
		this.velocity = { x: 0, y: -0.05, z: 0 };
		this.activeTetromino.rotation.set(0, 0, 0);
		
		// Update ghost piece
		this.updateGhostPiece();
		
		return this.activeTetromino;
	}
	
	/**
	 * Respawn tetromino
	 */
	respawnTetromino() {
		this.tetrominoRenderer.removeTetromino(this.activeTetromino);
		this.activeTetromino = null;
		this.isDropping = false;
		
		// Spawn a new tetromino after delay
		setTimeout(() => {
			this.spawnTetromino();
		}, 2000);
	}
	
	/**
	 * Apply random force to active tetromino
	 */
	applyRandomForce() {
		if (!this.activeTetromino) {
			this.spawnTetromino();
			return;
		}
		
		// Reset height if needed
		if (this.activeTetromino.position.y < 0) {
			this.activeTetromino.position.y = 10;
		}
		
		// Add random velocities
		this.velocity.x = (Math.random() - 0.5) * 0.5;
		this.velocity.z = (Math.random() - 0.5) * 0.5;
		
		console.log('Applied random force:', this.velocity);
	}
	
	/**
	 * Spawn multiple tetrominos
	 */
	spawnMultipleTetrominos(count = 5) {
		console.log(`Spawning ${count} tetrominos`);
		
		// Clear any existing tetrominos
		this.tetrominoRenderer.clearAllTetrominos();
		this.activeTetromino = null;
		
		// Define fixed spawn positions
		const positions = [
			{ x: 10, z: 10 },
			{ x: 12, z: 11 },
			{ x: 14, z: 12 },
			{ x: 16, z: 13 },
			{ x: 18, z: 14 }
		];
		
		// Spawn each tetromino with delay
		for (let i = 0; i < count; i++) {
			setTimeout(() => {
				// Select type and color
				const types = Object.keys(this.shapes);
				const type = types[i % types.length];
				const shape = this.shapes[type];
				const color = this.colors[i % this.colors.length];
				const pos = positions[i % positions.length];
				
				// Create tetromino
				const tetromino = this.tetrominoRenderer.createTetromino(shape, color, {
					type: type,
					width: shape[0].length,
					height: shape.length,
					color: color
				});
				
				// Set position
				tetromino.position.set(pos.x, 10 + i * 2, pos.z);
				
				// Make the last one active
				if (i === count - 1) {
					this.activeTetromino = tetromino;
					this.velocity = { x: 0, y: -0.02, z: 0 };
					this.updateGhostPiece();
				}
			}, i * 700);
		}
	}
	
	/**
	 * Set up a collision test
	 */
	testCollision() {
		console.log('Setting up collision test');
		
		// Clear any existing tetrominos
		this.tetrominoRenderer.clearAllTetrominos();
		
		// Create first tetromino - stationary
		const shape1 = this.shapes.T;
		const tetromino1 = this.tetrominoRenderer.createTetromino(shape1, 0xff0000, {
			type: 'T',
			width: shape1[0].length,
			height: shape1.length,
			color: 0xff0000
		});
		tetromino1.position.set(12, 2, 12);
		
		// Create second tetromino after delay - this will fall and collide
		setTimeout(() => {
			const shape2 = this.shapes.I;
			const tetromino2 = this.tetrominoRenderer.createTetromino(shape2, 0x00ff00, {
				type: 'I',
				width: shape2[0].length,
				height: shape2.length,
				color: 0x00ff00
			});
			tetromino2.position.set(12, 10, 12);
			
			// Make active
			this.activeTetromino = tetromino2;
			this.velocity = { x: 0, y: -0.02, z: 0 };
			this.updateGhostPiece();
		}, 500);
	}
	
	/**
	 * Test sticking behavior
	 */
	testSticking() {
		console.log('Setting up sticking test');
		
		// Clear any existing tetrominos
		this.tetrominoRenderer.clearAllTetrominos();
		
		// Create a tetromino that will stick to the board edge
		const shape = this.shapes.O;
		const tetromino = this.tetrominoRenderer.createTetromino(shape, 0xffff00, {
			type: 'O',
			width: shape[0].length,
			height: shape.length,
			color: 0xffff00
		});
		
		// Position exactly at the edge of the board (x=0)
		tetromino.position.set(0, 10, 8);
		
		// Make active
		this.activeTetromino = tetromino;
		this.velocity = { x: 0, y: -0.02, z: 0 };
		this.updateGhostPiece();
	}
	
	/**
	 * Reset the board
	 */
	resetBoard() {
		// Recreate the board
		this.createTestBoard();
		
		// Clear all tetrominos
		this.tetrominoRenderer.clearAllTetrominos();
		this.activeTetromino = null;
		
		// Spawn a new tetromino
		this.spawnTetromino();
	}
	
	/**
	 * Public API for moving the tetromino
	 */
	move(direction) {
		// Update key state based on direction
		switch (direction) {
			case 'left':
				this.keyState.left = true;
				setTimeout(() => { this.keyState.left = false; }, 100);
				break;
			case 'right':
				this.keyState.right = true;
				setTimeout(() => { this.keyState.right = false; }, 100);
				break;
			case 'forward':
				this.keyState.forward = true;
				setTimeout(() => { this.keyState.forward = false; }, 100);
				break;
			case 'backward':
				this.keyState.backward = true;
				setTimeout(() => { this.keyState.backward = false; }, 100);
				break;
		}
	}
	
	/**
	 * Public API for dropping the tetromino faster
	 */
	dropFaster(shouldDrop) {
		this.isDropping = shouldDrop;
	}
	
	/**
	 * Public API for rotating the tetromino
	 */
	rotate() {
		if (!this.activeTetromino) return;
		
		// Rotate around Y axis by 90 degrees
		const currentY = this.activeTetromino.rotation.y;
		this.activeTetromino.rotation.y = currentY + Math.PI / 2;
		
		console.log('Rotated tetromino');
	}
	
	/**
	 * Public API for toggling between camera views
	 */
	toggleCamera() {
		// Check current camera position from renderer
		const cameraPosition = this.renderer.getCamera().position;
		
		// Toggle between views
		if (cameraPosition.y > 20) {
			// If high up, move to side view
			this.renderer.setSideView();
		} else if (cameraPosition.x > 20) {
			// If side view, move to normal view
			this.renderer.resetCameraView();
		} else {
			// Otherwise, move to top view
			this.renderer.setTopView();
		}
	}
	
	/**
	 * Snap tetromino to grid if it's moving slowly
	 */
	snapToGridIfNeeded() {
		if (!this.activeTetromino) return;
		
		// Only snap if moving slowly
		if (Math.abs(this.velocity.x) < this.constants.GRID_SNAP_THRESHOLD && 
			Math.abs(this.velocity.z) < this.constants.GRID_SNAP_THRESHOLD) {
			// Round position to nearest grid cell
			this.activeTetromino.position.x = Math.round(this.activeTetromino.position.x);
			this.activeTetromino.position.z = Math.round(this.activeTetromino.position.z);
		}
	}
	
	/**
	 * Start dissolving a tetromino
	 */
	startDissolveTetromino(tetromino) {
		if (!tetromino) return;
		
		console.log('Starting tetromino dissolution');
		
		// Mark as dissolving
		tetromino.userData.dissolving = true;
		tetromino.userData.dissolveProgress = 0;
		
		// Make sure materials are transparent
		tetromino.traverse((child) => {
			if (child.material) {
				if (Array.isArray(child.material)) {
					child.material.forEach(material => {
						material.transparent = true;
					});
				} else {
					child.material.transparent = true;
				}
			}
		});
		
		// Add to dissolving array
		this.dissolvingTetrominos.push(tetromino);
	}
	
	/**
	 * Update dissolving tetrominos
	 */
	updateDissolvingTetrominos(deltaTime) {
		// Process each dissolving tetromino
		for (let i = this.dissolvingTetrominos.length - 1; i >= 0; i--) {
			const tetromino = this.dissolvingTetrominos[i];
			
			// Increment dissolve progress
			tetromino.userData.dissolveProgress += this.constants.DISSOLUTION_SPEED;
			
			// Update opacity and scale
			tetromino.traverse((child) => {
				if (child.material) {
					if (Array.isArray(child.material)) {
						child.material.forEach(material => {
							material.opacity = 1 - tetromino.userData.dissolveProgress;
						});
					} else {
						child.material.opacity = 1 - tetromino.userData.dissolveProgress;
					}
				}
				
				// Add falling/shrinking effect
				if (child.isMesh) {
					child.position.y -= 0.03;
					child.scale.multiplyScalar(0.97);
				}
			});
			
			// Remove if fully dissolved
			if (tetromino.userData.dissolveProgress >= 1) {
				// Remove from scene
				this.tetrominoRenderer.removeTetromino(tetromino);
				this.dissolvingTetrominos.splice(i, 1);
			}
		}
	}
	
	/**
	 * Schedule respawn of a new tetromino
	 */
	scheduleRespawn() {
		// Spawn a new tetromino after delay
		setTimeout(() => {
			this.spawnTetromino();
		}, 2000);
	}
} 