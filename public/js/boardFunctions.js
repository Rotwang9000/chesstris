/**
 * Updated functions for working with the sparse board structure
 * These functions accept parameters rather than relying on global variables
 */

/**
 * Check if a tetromino position is valid (no collisions)
 * @param {Object} gameState - The current game state
 * @param {Array} shape - 2D array representing tetromino shape
 * @param {Object} position - Position {x, z}
 * @returns {boolean} - Whether the position is valid
 */
function isValidTetrominoPosition(gameState, shape, position) {
	// Check each block of the tetromino
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				// Calculate block position
				const blockX = position.x + x;
				const blockZ = position.z + z;
				
				// Check if out of bounds - use board boundaries if available
				const minX = gameState.boardBounds?.minX || 0;
				const maxX = gameState.boardBounds?.maxX || 32;
				const minZ = gameState.boardBounds?.minZ || 0;
				const maxZ = gameState.boardBounds?.maxZ || 32;
				
				if (blockX < minX || blockX > maxX || 
					blockZ < minZ || blockZ > maxZ) {
					console.log(`Tetromino out of bounds at (${blockX}, ${blockZ})`);
					return false;
				}
				
				// Check for collision with existing board content using sparse structure
				if (gameState.board && gameState.board.cells) {
					const key = `${blockX},${blockZ}`;
					const cell = gameState.board.cells[key];
					
					if (cell !== undefined && cell !== null) {
						console.log(`Collision detected at (${blockX}, ${blockZ}) with:`, cell);
						return false;
					}
				}
			}
		}
	}
	
	return true;
}

/**
 * Place the current tetromino on the board
 * @param {Object} gameState - The current game state
 * @param {Function} showPlacementEffect - Function to show placement effect
 * @param {Function} updateGameStatusDisplay - Function to update game status
 * @param {Function} updateBoardVisuals - Function to update board visuals
 */
function placeTetromino(gameState, showPlacementEffect, updateGameStatusDisplay, updateBoardVisuals) {
	if (!gameState.currentTetromino) return;
	
	const shape = gameState.currentTetromino.shape;
	const posX = gameState.currentTetromino.position.x;
	const posZ = gameState.currentTetromino.position.z;
	const player = gameState.currentPlayer;
	
	console.log(`Placing tetromino at (${posX}, ${posZ})`);
	
	// If we don't have a board object yet, create one
	if (!gameState.board) {
		gameState.board = {
			cells: {},
			minX: 0,
			maxX: 32,
			minZ: 0,
			maxZ: 32,
			width: 33,
			height: 33
		};
	}
	
	// If we don't have a cells object yet, create one
	if (!gameState.board.cells) {
		gameState.board.cells = {};
	}
	
	// Place each block of the tetromino on the board
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// Set the cell in the sparse structure
				const key = `${boardX},${boardZ}`;
				gameState.board.cells[key] = {
					type: 'tetromino',
					player: player
				};
				
				// Update board boundaries
				if (boardX < gameState.board.minX) gameState.board.minX = boardX;
				if (boardX > gameState.board.maxX) gameState.board.maxX = boardX;
				if (boardZ < gameState.board.minZ) gameState.board.minZ = boardZ;
				if (boardZ > gameState.board.maxZ) gameState.board.maxZ = boardZ;
				
				// Update board dimensions
				gameState.board.width = gameState.board.maxX - gameState.board.minX + 1;
				gameState.board.height = gameState.board.maxZ - gameState.board.minZ + 1;
				
				// Log the placement
				console.log(`Placed block at (${boardX}, ${boardZ})`);
			}
		}
	}
	
	// Display the placed tetromino with a nice effect
	if (typeof showPlacementEffect === 'function') {
		showPlacementEffect(posX, posZ);
	}
	
	// Switch to chess phase
	gameState.turnPhase = 'chess';
	if (typeof updateGameStatusDisplay === 'function') {
		updateGameStatusDisplay();
	}
	
	// Clear the current tetromino
	gameState.currentTetromino = null;
	
	// Update the board visuals
	if (typeof updateBoardVisuals === 'function') {
		updateBoardVisuals();
	}
}

/**
 * Check if a tetromino is adjacent to existing cells (for valid placement)
 * @param {Object} gameState - The current game state
 * @param {Array} shape - 2D array representing tetromino shape
 * @param {number} posX - X position
 * @param {number} posZ - Z position
 * @returns {boolean} - Whether the tetromino is adjacent to existing cells
 */
function isTetrominoAdjacentToExistingCells(gameState, shape, posX, posZ) {
	// For each block in the tetromino, check if it's adjacent to an existing cell
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const blockX = posX + x;
				const blockZ = posZ + z;
				
				// Check all 8 adjacent positions
				const directions = [
					{ dx: -1, dz: 0 },  // Left
					{ dx: 1, dz: 0 },   // Right
					{ dx: 0, dz: -1 },  // Up
					{ dx: 0, dz: 1 },   // Down
					{ dx: -1, dz: -1 }, // Top-left
					{ dx: 1, dz: -1 },  // Top-right
					{ dx: -1, dz: 1 },  // Bottom-left
					{ dx: 1, dz: 1 }    // Bottom-right
				];
				
				for (const dir of directions) {
					const adjX = blockX + dir.dx;
					const adjZ = blockZ + dir.dz;
					const key = `${adjX},${adjZ}`;
					
					// Check if the adjacent cell contains a block
					if (gameState.board && gameState.board.cells && 
						gameState.board.cells[key] !== undefined && 
						gameState.board.cells[key] !== null) {
						return true;
					}
				}
			}
		}
	}
	
	// No adjacent existing cells found
	return false;
}

/**
 * Check collision between tetromino and board or boundary
 * @param {Object} gameState - The current game state
 * @param {Array} shape - Tetromino shape
 * @param {number} posX - X position
 * @param {number} posZ - Z position
 * @returns {boolean} - Whether there is a collision
 */
function checkTetrominoCollision(gameState, shape, posX, posZ) {
	// For each block in the tetromino
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// Check board boundaries
				const minX = gameState.boardBounds?.minX || 0;
				const maxX = gameState.boardBounds?.maxX || 32;
				const minZ = gameState.boardBounds?.minZ || 0;
				const maxZ = gameState.boardBounds?.maxZ || 32;
				
				if (boardX < minX || boardX > maxX || boardZ < minZ || boardZ > maxZ) {
					return true; // Out of bounds
				}
				
				// Check if the position is already occupied
				const key = `${boardX},${boardZ}`;
				if (gameState.board && gameState.board.cells && 
					gameState.board.cells[key] !== undefined && 
					gameState.board.cells[key] !== null) {
					return true; // Collision
				}
			}
		}
	}
	
	return false; // No collision
}

/**
 * Update board cell incrementally (for animations or live updates)
 * @param {Object} gameState - The current game state
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {*} value - Value to set
 */
function updateBoardCell(gameState, x, z, value) {
	if (!gameState.board) {
		gameState.board = {
			cells: {},
			minX: 0,
			maxX: 32,
			minZ: 0,
			maxZ: 32,
			width: 33,
			height: 33
		};
	}
	
	if (!gameState.board.cells) {
		gameState.board.cells = {};
	}
	
	// Update the cell
	const key = `${x},${z}`;
	
	if (value === 0 || value === null) {
		// Remove the cell if setting to empty
		delete gameState.board.cells[key];
	} else {
		// Set the cell value
		gameState.board.cells[key] = value;
		
		// Update board boundaries
		if (x < gameState.board.minX) gameState.board.minX = x;
		if (x > gameState.board.maxX) gameState.board.maxX = x;
		if (z < gameState.board.minZ) gameState.board.minZ = z;
		if (z > gameState.board.maxZ) gameState.board.maxZ = z;
		
		// Update board dimensions
		gameState.board.width = gameState.board.maxX - gameState.board.minX + 1;
		gameState.board.height = gameState.board.maxZ - gameState.board.minZ + 1;
	}
}

/**
 * Create a base grid of board cells
 * @param {Object} gameState - The current game state
 * @param {Object} boardGroup - THREE.js group for board cells
 * @param {Function} createFloatingIsland - Function to create island mesh
 * @param {Object} THREE - THREE.js library
 */
function createBoardCells(gameState, boardGroup, createFloatingIsland, THREE) {
	// Clear existing board first
	const boardElements = boardGroup.children.filter(child => 
		child.userData && (child.userData.type === 'cell' || child.userData.type === 'cloud'));
	
	for (const element of boardElements) {
		boardGroup.remove(element);
	}
	
	// Create base grid of cells
	const boardSize = gameState.boardSize || 30;
	
	// Get board boundaries from state
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || boardSize - 1;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || boardSize - 1;
	
	// Create basic materials
	const whiteMaterial = new THREE.MeshStandardMaterial({ 
		color: 0xf5f5f5,
		roughness: 0.8,
		metalness: 0.1
	});
	
	const darkMaterial = new THREE.MeshStandardMaterial({ 
		color: 0x3a3a3a,
		roughness: 0.7, 
		metalness: 0.2
	});
	
	// Create a very light cloud material for empty cells - making it more subtle
	const cloudMaterial = new THREE.MeshStandardMaterial({
		color: 0xf8f8ff,
		roughness: 0.9,
		metalness: 0.0,
		transparent: true,
		opacity: 0.15 // Much lower opacity
	});
	
	// Create a 8x8 grid of cells at minimum
	const minGridSize = 8;
	const gridWidth = Math.max(maxX - minX + 1, minGridSize);
	const gridHeight = Math.max(maxZ - minZ + 1, minGridSize);
	
	// Calculate board center (where 0,0 should be rendered)
	const centerX = (minX + maxX) / 2;
	const centerZ = (minZ + maxZ) / 2;
	
	// Track the number of cells created for performance monitoring
	let cellCount = 0;
	let cloudCount = 0;
	
	// Create cells - only create cells that are visible or necessary
	// For very large boards, we create a subset visible in the viewport + some extras
	// The actual visible range will depend on camera position and view settings
	const maxVisibleCells = 50; // Maximum cells to create in each dimension for performance
	
	// Calculate visible range
	const visibleRangeX = Math.min(gridWidth, maxVisibleCells);
	const visibleRangeZ = Math.min(gridHeight, maxVisibleCells);
	
	// Calculate start and end positions
	const startX = Math.max(minX, Math.floor(centerX - visibleRangeX/2));
	const endX = Math.min(maxX + 1, startX + visibleRangeX);
	const startZ = Math.max(minZ, Math.floor(centerZ - visibleRangeZ/2));
	const endZ = Math.min(maxZ + 1, startZ + visibleRangeZ);
	
	// Log visible cell range
	console.log(`Creating cells in range: x=${startX}-${endX}, z=${startZ}-${endZ} (board bounds: x=${minX}-${maxX}, z=${minZ}-${maxZ})`);
	
	// Debug output of the actual board structure
	console.log('Board structure sample:', 
		gameState.board.cells ? `${Object.keys(gameState.board.cells).length} cells` : 'Empty');
	
	// If createFloatingIsland function is not provided, create a simple fallback
	const createIsland = createFloatingIsland || function(x, z, material, offset, hasContent) {
		const geometry = new THREE.BoxGeometry(0.9, 0.2, 0.9);
		const mesh = new THREE.Mesh(geometry, material);
		return mesh;
	};
	
	for (let z = startZ; z < endZ; z++) {
		for (let x = startX; x < endX; x++) {
			// Check if this position has actual content in the sparse board
			const key = `${x},${z}`;
			const hasContent = gameState.board && 
							  gameState.board.cells && 
							  gameState.board.cells[key] !== undefined && 
							  gameState.board.cells[key] !== null;
							  
			// Always create a cell for border areas or non-empty cells
			const isBorder = x === startX || x === endX - 1 || z === startZ || z === endZ - 1;
			const isCheckerboardSquare = (x + z) % 2 === 0;
			
			if (hasContent || (isCheckerboardSquare && (isBorder || Math.random() < 0.3))) {
				// Full cell for actual content or checkerboard pattern
				// Choose material based on checkerboard pattern
				const material = isCheckerboardSquare ? whiteMaterial : darkMaterial;
				
				// Create floating island with slightly less vertical offset
				const island = createIsland(x, z, material, 0.3, hasContent);
				
				// Tag as a proper cell
				island.userData = {
					type: 'cell',
					position: { x, z },
					isEmpty: !hasContent
				};

				// Add to board group
				boardGroup.add(island);
				// Position relative to center
				island.position.x = x - centerX;
				island.position.z = z - centerZ;
				island.position.y = -0.5; // Move lower to create flat board
				
				cellCount++;
			} else if ((x + z) % 4 === 0 && Math.random() < 0.15) { // Reduced density
				// Create a very simple flat plane for empty areas - no caps, just flat clouds
				const cloudSize = 0.5 + Math.random() * 0.2; // Smaller size
				const cloudGeometry = new THREE.PlaneGeometry(cloudSize, cloudSize);
				const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
				
				// Tag as a decoration cloud
				cloud.userData = {
					type: 'cloud',
					position: { x, z }
				};
				
				// Set position
				cloud.position.x = x - centerX;
				cloud.position.z = z - centerZ;
				cloud.position.y = -1.5 - Math.random() * 0.3; // Lower than cells
				cloud.rotation.x = -Math.PI / 2; // Flat orientation
				
				// Add to board group
				boardGroup.add(cloud);
				cloudCount++;
			}
		}
	}
	
	console.log(`Created ${cellCount} board cells and ${cloudCount} decorative clouds for visualization`);
	return { cellCount, cloudCount };
}

/**
 * Find the current player's king position
 * @param {Object} gameState - The current game state
 * @returns {Object|null} - The king's position {x, z} or null if not found
 */
function findPlayerKingPosition(gameState) {
	const currentPlayer = gameState.currentPlayer;
	
	// Check if we have chess pieces
	if (!gameState.chessPieces || !Array.isArray(gameState.chessPieces)) {
		console.warn("No chess pieces found in game state");
		return null;
	}
	
	// Find the king for the current player
	for (const piece of gameState.chessPieces) {
		// Skip pieces that don't belong to the current player
		if (piece.player !== currentPlayer) continue;
		
		// Check if this is a king (type 6 or "KING")
		const isKing = 
			piece.type === 6 || 
			piece.type === "KING" || 
			(typeof piece.type === 'string' && piece.type.toUpperCase() === "KING");
		
		if (isKing && piece.position) {
			return {
				x: piece.position.x,
				z: piece.position.z
			};
		}
	}
	
	console.warn(`No king found for player ${currentPlayer}`);
	return null;
}

/**
 * Create a random tetromino for gameplay, positioned near the player's king
 * @param {Object} gameState - The current game state
 * @returns {Object} Tetromino object
 */
function createRandomTetromino(gameState) {
	// Tetromino types and shapes
	const tetrominoTypes = [
		{ 
			// I - long piece
			type: 'I',
			shape: [
				[0, 0, 0, 0],
				[1, 1, 1, 1],
				[0, 0, 0, 0],
				[0, 0, 0, 0]
			]
		},
		{ 
			// J - L facing left
			type: 'J',
			shape: [
				[1, 0, 0],
				[1, 1, 1],
				[0, 0, 0]
			]
		},
		{ 
			// L - L facing right
			type: 'L',
			shape: [
				[0, 0, 1],
				[1, 1, 1],
				[0, 0, 0]
			]
		},
		{ 
			// O - square
			type: 'O',
			shape: [
				[1, 1],
				[1, 1]
			]
		},
		{ 
			// S - S shape
			type: 'S',
			shape: [
				[0, 1, 1],
				[1, 1, 0],
				[0, 0, 0]
			]
		},
		{ 
			// T - T shape
			type: 'T',
			shape: [
				[0, 1, 0],
				[1, 1, 1],
				[0, 0, 0]
			]
		},
		{ 
			// Z - Z shape
			type: 'Z',
			shape: [
				[1, 1, 0],
				[0, 1, 1],
				[0, 0, 0]
			]
		}
	];
	
	// Pick a random type
	const randomIndex = Math.floor(Math.random() * tetrominoTypes.length);
	const selectedType = tetrominoTypes[randomIndex];
	
	// Try to find the king's position
	const kingPos = findPlayerKingPosition(gameState);
	
	// Default position parameters if king not found
	let startX, startZ;
	
	if (kingPos) {
		// Position the tetromino 2-3 cells away from the king
		// Direction is randomly chosen but biased towards the player's side of the board
		const direction = Math.floor(Math.random() * 4); // 0: up, 1: right, 2: down, 3: left
		const distance = 2 + Math.floor(Math.random() * 2); // 2-3 cells away
		
		switch (direction) {
			case 0: // Up
				startX = kingPos.x - Math.floor(selectedType.shape[0].length / 2);
				startZ = kingPos.z - distance - selectedType.shape.length;
				break;
			case 1: // Right
				startX = kingPos.x + distance;
				startZ = kingPos.z - Math.floor(selectedType.shape.length / 2);
				break;
			case 2: // Down
				startX = kingPos.x - Math.floor(selectedType.shape[0].length / 2);
				startZ = kingPos.z + distance;
				break;
			case 3: // Left
				startX = kingPos.x - distance - selectedType.shape[0].length;
				startZ = kingPos.z - Math.floor(selectedType.shape.length / 2);
				break;
		}
		
		console.log(`Positioning tetromino near king at (${kingPos.x}, ${kingPos.z})`);
	} else {
		// Fallback to board center if king not found
		const minX = gameState.boardBounds?.minX || 0;
		const maxX = gameState.boardBounds?.maxX || 20;
		const minZ = gameState.boardBounds?.minZ || 0;
		const maxZ = gameState.boardBounds?.maxZ || 20;
		
		// Calculate center position
		const centerX = Math.floor((minX + maxX) / 2);
		const centerZ = Math.floor((minZ + maxZ) / 2);
		
		// Calculate starting position
		startX = centerX - Math.floor(selectedType.shape[0].length / 2);
		startZ = minZ + Math.floor((maxZ - minZ) / 3);
		
		console.log("King not found. Positioning tetromino at board center.");
	}
	
	// Ensure the tetromino is within board bounds
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 20;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 20;
	
	startX = Math.max(minX, Math.min(maxX - selectedType.shape[0].length, startX));
	startZ = Math.max(minZ, Math.min(maxZ - selectedType.shape.length, startZ));
	
	// Create the tetromino object
	return {
		type: selectedType.type,
		shape: selectedType.shape,
		position: { x: startX, z: startZ },
		player: gameState.currentPlayer || 1,
		heightAboveBoard: 5 // Start above the board for animation
	};
}

/**
 * Render the current tetromino on the board
 * @param {Object} gameState - The current game state
 * @param {Object} tetromino - Tetromino to render
 * @param {Object} tetrominoGroup - THREE.js group for tetromino pieces
 * @param {Function} createTetrominoBlock - Function to create tetromino blocks
 */
function renderTetromino(gameState, tetromino, tetrominoGroup, createTetrominoBlock) {
	if (!tetromino || !tetromino.shape) return;
	
	// Clear existing tetromino group
	while (tetrominoGroup.children.length > 0) {
		tetrominoGroup.remove(tetrominoGroup.children[0]);
	}
	
	// Get board center for correct positioning
	const minX = gameState.boardBounds?.minX || 0;
	const maxX = gameState.boardBounds?.maxX || 20;
	const minZ = gameState.boardBounds?.minZ || 0;
	const maxZ = gameState.boardBounds?.maxZ || 20;
	
	// Calculate board center (where 0,0 should be rendered)
	const centerX = (minX + maxX) / 2;
	const centerZ = (minZ + maxZ) / 2;
	
	// Iterate through the tetromino shape
	for (let z = 0; z < tetromino.shape.length; z++) {
		for (let x = 0; x < tetromino.shape[z].length; x++) {
			if (tetromino.shape[z][x] === 1) {
				// Calculate block position
				const blockX = tetromino.position.x + x;
				const blockZ = tetromino.position.z + z;
				
				// Create a tetromino block with height above board
				createTetrominoBlock(
					blockX, 
					blockZ, 
					tetromino.player, 
					false, 
					tetromino.heightAboveBoard || 0
				);
				
				// Also create ghost piece position if the tetromino is above the board
				if (tetromino.heightAboveBoard > 0) {
					// Find the lowest valid position
					let ghostZ = blockZ;
					let validPosition = true;
					
					// Keep moving down until we hit something
					while (validPosition) {
						ghostZ++;
						
						// Check if out of bounds
						if (ghostZ > maxZ) {
							ghostZ--;
							break;
						}
						
						// Check if there's a collision with an existing block
						const key = `${blockX},${ghostZ}`;
						if (gameState.board && gameState.board.cells && 
							gameState.board.cells[key] !== undefined && 
							gameState.board.cells[key] !== null) {
							ghostZ--;
							break;
						}
					}
					
					// Create ghost block at the lowest valid position
					if (ghostZ > blockZ) {
						createTetrominoBlock(blockX, ghostZ, tetromino.player, true, 0);
					}
				}
			}
		}
	}
	
	// Update all tetromino blocks to have the correct relative position to the board center
	tetrominoGroup.children.forEach(block => {
		if (block.userData && block.userData.position) {
			const { x, z } = block.userData.position;
			block.position.x = x - centerX;
			block.position.z = z - centerZ;
		}
	});
}

/**
 * Handle click on Tetris phase button
 * @param {Object} gameState - The current game state
 * @param {Function} updateGameStatusDisplay - Function to update game status
 * @param {Function} updateBoardVisuals - Function to update board visuals
 * @param {Object} tetrominoGroup - THREE.js group for tetromino pieces
 * @param {Function} createTetrominoBlock - Function to create tetromino blocks
 */
function handleTetrisPhaseClick(gameState, updateGameStatusDisplay, updateBoardVisuals, tetrominoGroup, createTetrominoBlock) {
	gameState.turnPhase = 'tetris';
	
	// Create a new tetromino if none exists
	if (!gameState.currentTetromino) {
		gameState.currentTetromino = createRandomTetromino(gameState);
		console.log("Created new tetromino:", gameState.currentTetromino);
	}
	
	// Force refresh piece visibility
	if (typeof updateGameStatusDisplay === 'function') {
		updateGameStatusDisplay();
	}
	
	// Make sure pieces are shown/hidden correctly
	if (typeof updateBoardVisuals === 'function') {
		updateBoardVisuals();
	}
	
	// Render the tetromino
	renderTetromino(gameState, gameState.currentTetromino, tetrominoGroup, createTetrominoBlock);
	
	console.log("Debug: Switched to TETRIS phase");
}

/**
 * Create a chess piece at the specified position
 * @param {Object} gameState - The current game state
 * @param {number} x - X coordinate on the board
 * @param {number} z - Z coordinate on the board
 * @param {string|number} pieceType - Type of piece (PAWN, ROOK, etc. or numeric)
 * @param {number|string} playerIdent - Player identifier
 * @param {number|string} ourPlayerIdent - Our player identifier
 * @param {Object} THREE - THREE.js library
 * @returns {Object} THREE.js Group containing the piece
 */
function createChessPiece(gameState, x, z, pieceType, playerIdent, ourPlayerIdent, orientation, THREE) {
	try {
		// Get board center for correct positioning
		const minX = gameState.boardBounds?.minX || 0;
		const maxX = gameState.boardBounds?.maxX || 20;
		const minZ = gameState.boardBounds?.minZ || 0;
		const maxZ = gameState.boardBounds?.maxZ || 20;
		
		// Calculate board center (where 0,0 should be rendered)
		const centerX = (minX + maxX) / 2;
		const centerZ = (minZ + maxZ) / 2;
		
		// Verify parameters for debugging
		if (pieceType === undefined || pieceType === null) {
			console.warn(`Invalid pieceType (${pieceType}) for cell at (${x},${z}), using default`);
			pieceType = 'PAWN'; // Default to pawn
		}
		
		const pieceNames = ['PAWN', 'ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING'];

		// Ensure string type for piece name
		let type;
		if (typeof pieceType === 'string') {
			type = pieceType.toUpperCase();
		} else if (typeof pieceType === 'number') {
			// Check if it's a legacy format (player*10 + type)
			if (pieceType > 10) {
				// Legacy format - extract type from combined code
				const extractedType = pieceType % 10;
				type = pieceNames[extractedType - 1] || 'PAWN';
			} else {
				// Direct numeric type (1=PAWN, 2=ROOK, etc.)
				type = pieceNames[pieceType - 1] || 'PAWN';
			}
		} else {
			type = 'PAWN'; // Default if unrecognized format
		}
		
		// Map player identity to player number (1 or 2)
		const player = playerIdent === ourPlayerIdent ? 1 : 2;
		
		// Define colors for pieces - using traditional Russian chess colors
		const playerColors = {
			1: { // Our player - blue/gold theme
				primary: 0x0055AA,
				secondary: 0xFFD700
			},
			2: { // Opponent - red/gold theme
				primary: 0xAA0000,
				secondary: 0xFFD700
			}
		};
		
		// Get colors for this player
		const colors = playerColors[player] || playerColors[1]; // Default to player 1 colors
		
		// Create a piece group to hold all components
		const pieceGroup = new THREE.Group();
		
		// Store metadata for identification
		pieceGroup.userData = {
			type: 'chessPiece',
			pieceType: type,
			player: playerIdent,
			position: { x, z }
		};
		
		// Position the group using the SAME coordinate system as the board cells
		pieceGroup.position.set(x - centerX, 0, z - centerZ);
		
		// Base of piece
		const baseGeometry = new THREE.CylinderGeometry(0.35, 0.4, 0.2, 16);
		const baseMaterial = new THREE.MeshStandardMaterial({
			color: colors.primary,
			metalness: 0.7,
			roughness: 0.3
		});
		const base = new THREE.Mesh(baseGeometry, baseMaterial);
		base.position.y = 0.1;
		pieceGroup.add(base);
		
		// Main body of piece - adjust based on type
		let height = 1.0; // Default height
		let bodyWidth = 0.3; // Default width
		
		// Customize for each piece type
		switch (type) {
			case 'KING':
				height = 1.6;
				bodyWidth = 0.35;
				break;
			case 'QUEEN':
				height = 1.5;
				bodyWidth = 0.32;
				break;
			case 'BISHOP':
				height = 1.4;
				bodyWidth = 0.28;
				break;
			case 'KNIGHT':
				height = 1.3;
				bodyWidth = 0.30;
				break;
			case 'ROOK':
				height = 1.2;
				bodyWidth = 0.35;
				break;
			default: // PAWN
				height = 1.0;
				bodyWidth = 0.25;
		}
		
		// Main body shape
		const bodyGeometry = new THREE.CylinderGeometry(bodyWidth * 0.8, bodyWidth, height * 0.7, 16);
		const bodyMaterial = new THREE.MeshStandardMaterial({
			color: colors.primary,
			metalness: 0.5,
			roughness: 0.5,
			emissive: colors.primary,
			emissiveIntensity: 0.2
		});
		const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
		body.position.y = height * 0.35 + 0.1; // Center the body
		pieceGroup.add(body);
		
		// Top part - different for each piece type
		let topPart;
		
		switch (type) {
			case 'KING':
				// Create Russian imperial crown with cross
				const crownGeometry = new THREE.CylinderGeometry(bodyWidth * 1.1, bodyWidth * 0.9, height * 0.2, 16);
				const crownMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.8,
					roughness: 0.2,
					emissive: colors.secondary,
					emissiveIntensity: 0.3
				});
				topPart = new THREE.Mesh(crownGeometry, crownMaterial);
				topPart.position.y = height * 0.7 + 0.1;
				pieceGroup.add(topPart);
				
				// Add cross on top
				const crossVGeometry = new THREE.BoxGeometry(0.08, height * 0.25, 0.08);
				const crossHGeometry = new THREE.BoxGeometry(0.25, 0.08, 0.08);
				const crossMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.9,
					roughness: 0.1,
					emissive: colors.secondary,
					emissiveIntensity: 0.3
				});
				
				const crossV = new THREE.Mesh(crossVGeometry, crossMaterial);
				crossV.position.y = height * 0.85;
				pieceGroup.add(crossV);
				
				const crossH = new THREE.Mesh(crossHGeometry, crossMaterial);
				crossH.position.y = height * 0.8;
				pieceGroup.add(crossH);
				break;
				
			case 'QUEEN':
				// Create crown with multiple points
				const queenCrownGeometry = new THREE.CylinderGeometry(bodyWidth * 0.9, bodyWidth * 0.95, height * 0.15, 16);
				const queenCrownMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.7,
					roughness: 0.3,
					emissive: colors.secondary,
					emissiveIntensity: 0.25
				});
				topPart = new THREE.Mesh(queenCrownGeometry, queenCrownMaterial);
				topPart.position.y = height * 0.7 + 0.1;
				pieceGroup.add(topPart);
				
				// Add decorative points
				const pointCount = 5;
				for (let i = 0; i < pointCount; i++) {
					const angle = (i / pointCount) * Math.PI * 2;
					const pointGeometry = new THREE.ConeGeometry(0.06, height * 0.12, 8);
					const pointMaterial = new THREE.MeshStandardMaterial({
						color: colors.secondary,
						metalness: 0.8,
						roughness: 0.2
					});
					
					const point = new THREE.Mesh(pointGeometry, pointMaterial);
					point.position.set(
						Math.cos(angle) * (bodyWidth * 0.7),
						height * 0.78,
						Math.sin(angle) * (bodyWidth * 0.7)
					);
					pieceGroup.add(point);
				}
				
				// Add central ball
				const ballGeometry = new THREE.SphereGeometry(0.08, 16, 16);
				const ball = new THREE.Mesh(ballGeometry, queenCrownMaterial);
				ball.position.y = height * 0.85;
				pieceGroup.add(ball);
				break;
				
			case 'BISHOP':
				// Mitre-like top
				const bishopTopGeometry = new THREE.ConeGeometry(bodyWidth * 0.8, height * 0.3, 16);
				const bishopTopMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.5,
					roughness: 0.5
				});
				topPart = new THREE.Mesh(bishopTopGeometry, bishopTopMaterial);
				topPart.position.y = height * 0.75;
				pieceGroup.add(topPart);
				
				// Add small ball on top
				const smallBallGeometry = new THREE.SphereGeometry(0.06, 12, 12);
				const smallBall = new THREE.Mesh(smallBallGeometry, bishopTopMaterial);
				smallBall.position.y = height * 0.95;
				pieceGroup.add(smallBall);
				break;
				
			case 'KNIGHT':
				// Horse head shape (simplified)
				const knightTopGeometry = new THREE.BoxGeometry(bodyWidth * 0.8, height * 0.25, bodyWidth * 1.2);
				const knightTopMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.4,
					roughness: 0.6
				});
				topPart = new THREE.Mesh(knightTopGeometry, knightTopMaterial);
				topPart.position.y = height * 0.7;
				topPart.position.z = bodyWidth * 0.3; // Offset forward
				topPart.rotation.x = Math.PI * 0.1; // Tilt forward
				pieceGroup.add(topPart);
				
				// Add ears
				const earGeometry = new THREE.ConeGeometry(0.06, 0.15, 8);
				const ear1 = new THREE.Mesh(earGeometry, knightTopMaterial);
				ear1.position.set(bodyWidth * 0.3, height * 0.85, bodyWidth * 0.1);
				ear1.rotation.x = -Math.PI * 0.15;
				pieceGroup.add(ear1);
				
				const ear2 = new THREE.Mesh(earGeometry, knightTopMaterial);
				ear2.position.set(-bodyWidth * 0.3, height * 0.85, bodyWidth * 0.1);
				ear2.rotation.x = -Math.PI * 0.15;
				pieceGroup.add(ear2);
				break;
				
			case 'ROOK':
				// Castle tower top
				const rookTopGeometry = new THREE.BoxGeometry(bodyWidth * 1.1, height * 0.2, bodyWidth * 1.1);
				const rookTopMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.5,
					roughness: 0.5
				});
				topPart = new THREE.Mesh(rookTopGeometry, rookTopMaterial);
				topPart.position.y = height * 0.7;
				pieceGroup.add(topPart);
				
				// Add crenellations (castle tower features)
				const crenellationCount = 4;
				const crenellationWidth = bodyWidth * 0.3;
				const crenellationGeometry = new THREE.BoxGeometry(crenellationWidth, height * 0.1, crenellationWidth);
				
				for (let i = 0; i < crenellationCount; i++) {
					// Position around the top edge
					const angle = (i / crenellationCount) * Math.PI * 2 + (Math.PI / crenellationCount);
					const offsetX = Math.cos(angle) * (bodyWidth * 0.6);
					const offsetZ = Math.sin(angle) * (bodyWidth * 0.6);
					
					const crenellation = new THREE.Mesh(crenellationGeometry, rookTopMaterial);
					crenellation.position.set(offsetX, height * 0.85, offsetZ);
					pieceGroup.add(crenellation);
				}
				break;
				
			default: // PAWN
				// Simple round top
				const pawnTopGeometry = new THREE.SphereGeometry(bodyWidth * 0.8, 16, 16);
				const pawnTopMaterial = new THREE.MeshStandardMaterial({
					color: colors.secondary,
					metalness: 0.5,
					roughness: 0.5
				});
				topPart = new THREE.Mesh(pawnTopGeometry, pawnTopMaterial);
				topPart.position.y = height * 0.7;
				pieceGroup.add(topPart);
		}

		// Rotate the piece based on orientation
		if (orientation !== undefined) {
			pieceGroup.rotation.y = orientation;
		}
		
		// Make all parts cast and receive shadows
		pieceGroup.traverse(child => {
			if (child.isMesh) {
				child.castShadow = true;
				child.receiveShadow = true;
			}
		});
		
		return pieceGroup;
	} catch (err) {
		console.error('Error creating chess piece:', err);
		
		// Create a simple fallback piece
		const fallbackGroup = new THREE.Group();
		const fallbackGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.5);
		const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
		const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
		fallbackGroup.add(fallbackMesh);
		fallbackGroup.position.set(x, 0.4, z);
		
		return fallbackGroup;
	}
}

// Export all functions as a module
export const boardFunctions = {
	createRandomTetromino,
	renderTetromino,
	handleTetrisPhaseClick,
	isValidTetrominoPosition,
	placeTetromino,
	isTetrominoAdjacentToExistingCells,
	checkTetrominoCollision,
	updateBoardCell,
	createBoardCells,
	findPlayerKingPosition,
	createChessPiece
};