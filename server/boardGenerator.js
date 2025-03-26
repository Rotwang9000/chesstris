/**
 * Board Generator - Server-side implementation for Shaktris
 * Handles generation of the board layout including home zone positioning
 * 
 * This module is responsible for:
 * 1. Calculating positions for home zones with specific pawn clash requirements
 * 2. Generating the home zones for each player
 * 3. Creating chess pieces with the correct orientation
 * 4. Placing a centre marker for reliable client-side reference
 * 
 * The implementation uses a sparse cell-based approach rather than a traditional 2D array.
 * Each cell is identified by a coordinate key in the format "x,z".
 */

/**
 * Calculate home zone position with controlled pawn clashing
 * 
 * This algorithm:
 * 1. Uses a randomized approach with specific constraints
 * 2. Ensures home cells aren't directly in the path of other players' pawns (8 spaces)
 * 3. Arranges for potential pawn clashing after 6 moves (partial clash)
 * 4. Falls back to placement relative to the furthest cell if needed
 * 
 * @param {number} playerIndex - Player index (0-based)
 * @param {Object} gameState - Current game state to check existing positions
 * @param {number} boardWidth - Board width
 * @param {number} boardHeight - Board height
 * @param {number} homeZoneWidth - Home zone width (typically 8 for chess)
 * @param {number} homeZoneHeight - Home zone height (typically 2 for chess)
 * @returns {Object} Position and orientation for the home zone
 */
function calculateHomePosition(playerIndex, gameState, boardWidth, boardHeight, homeZoneWidth, homeZoneHeight) {
	// For the first player, place near the center
	if (playerIndex === 0) {
		const centerX = Math.floor(boardWidth / 2) - Math.floor(homeZoneWidth / 2);
		const centerZ = Math.floor(boardHeight / 2) - Math.floor(homeZoneHeight / 2);
		
		return {
			x: centerX,
			z: centerZ,
			orientation: 0 // First player faces up by default
		};
	}
	
	// Get existing player home zones
	const existingHomeZones = [];
	if (gameState && gameState.homeZones) {
		for (const playerId in gameState.homeZones) {
			existingHomeZones.push(gameState.homeZones[playerId]);
		}
	}
	
	// Track pawn paths for existing players
	const pawnPaths = calculateExistingPawnPaths(existingHomeZones);
	
	// Try to find a valid position with 100 attempts
	for (let attempt = 0; attempt < 100; attempt++) {
		// Generate random position
		const randomOrientation = Math.floor(Math.random() * 4); // 0-3
		let x = Math.floor(Math.random() * (boardWidth - homeZoneWidth));
		let z = Math.floor(Math.random() * (boardHeight - homeZoneHeight));
		
		// Adjust position based on orientation
		switch (randomOrientation) {
			case 0: // Facing up - pawns at bottom
				// Position is already correct
				break;
			case 1: // Facing right - pawns at left
				// Ensure there's room for pawns on the left
				x = Math.max(6, x);
				break;
			case 2: // Facing down - pawns at top
				// Ensure there's room for pawns on top
				z = Math.max(6, z);
				break;
			case 3: // Facing left - pawns at right
				// Ensure there's room for pawns on the right
				x = Math.min(boardWidth - homeZoneWidth - 6, x);
				break;
		}
		
		// Check if position is valid (not in direct path of other pawns at 8 moves)
		if (isValidHomePosition(x, z, randomOrientation, homeZoneWidth, homeZoneHeight, pawnPaths, 8)) {
			// Check if position enables clashing at 6 spaces
			if (hasPartialPawnClash(x, z, randomOrientation, homeZoneWidth, homeZoneHeight, pawnPaths, 6)) {
				return {
					x,
					z,
					orientation: randomOrientation
				};
			}
		}
	}
	
	// If no valid position found after 100 attempts, place relative to furthest cell
	return calculateFallbackPosition(existingHomeZones, boardWidth, boardHeight, homeZoneWidth, homeZoneHeight);
}

/**
 * Calculate existing pawn paths for all players
 * @param {Array} homeZones - Array of home zone objects
 * @returns {Array} Array of pawn path objects with position and direction
 */
function calculateExistingPawnPaths(homeZones) {
	const pawnPaths = [];
	
	for (const homeZone of homeZones) {
		const { x, z, width, height, orientation } = homeZone;
		
		// For each pawn position in the home zone (assuming front row/column has pawns)
		for (let i = 0; i < width; i++) {
			let pawnX, pawnZ, dirX = 0, dirZ = 0;
			
			switch (orientation) {
				case 0: // Facing up - pawns at bottom
					pawnX = x + i;
					pawnZ = z;
					dirZ = -1; // Pawns move up
					break;
				case 1: // Facing right - pawns at left
					pawnX = x;
					pawnZ = z + i;
					dirX = 1; // Pawns move right
					break;
				case 2: // Facing down - pawns at top
					pawnX = x + i;
					pawnZ = z + height - 1;
					dirZ = 1; // Pawns move down
					break;
				case 3: // Facing left - pawns at right
					pawnX = x + width - 1;
					pawnZ = z + i;
					dirX = -1; // Pawns move left
					break;
			}
			
			pawnPaths.push({
				startX: pawnX,
				startZ: pawnZ,
				dirX,
				dirZ
			});
		}
	}
	
	return pawnPaths;
}

/**
 * Check if a potential home zone position is valid (not in direct path of other pawns)
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} orientation - Orientation (0-3)
 * @param {number} width - Home zone width
 * @param {number} height - Home zone height
 * @param {Array} pawnPaths - Array of existing pawn paths
 * @param {number} moveDistance - How many spaces forward to check
 * @returns {boolean} True if position is valid
 */
function isValidHomePosition(x, z, orientation, width, height, pawnPaths, moveDistance) {
	// Get the cells that would be occupied by this home zone
	const homeCells = [];
	
	for (let dx = 0; dx < width; dx++) {
		for (let dz = 0; dz < height; dz++) {
			homeCells.push({ x: x + dx, z: z + dz });
		}
	}
	
	// Check if any home cells are in the path of existing pawns
	for (const path of pawnPaths) {
		for (let move = 1; move <= moveDistance; move++) {
			const pathX = path.startX + (path.dirX * move);
			const pathZ = path.startZ + (path.dirZ * move);
			
			// Check if this path position conflicts with any home cell
			if (homeCells.some(cell => cell.x === pathX && cell.z === pathZ)) {
				return false;
			}
		}
	}
	
	return true;
}

/**
 * Check if the position allows for partial pawn clashing at a given distance
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {number} orientation - Orientation (0-3)
 * @param {number} width - Home zone width
 * @param {number} height - Home zone height
 * @param {Array} pawnPaths - Array of existing pawn paths
 * @param {number} clashDistance - Distance at which pawns should clash
 * @returns {boolean} True if at least 2 pawns can clash at the specified distance
 */
function hasPartialPawnClash(x, z, orientation, width, height, pawnPaths, clashDistance) {
	// If no existing pawns, any position is valid
	if (pawnPaths.length === 0) return true;
	
	// Calculate pawn positions for this potential home zone
	const newPawnPaths = [];
	
	switch (orientation) {
		case 0: // Facing up - pawns at bottom
			for (let i = 0; i < width; i++) {
				newPawnPaths.push({
					startX: x + i,
					startZ: z,
					dirX: 0,
					dirZ: -1
				});
			}
			break;
		case 1: // Facing right - pawns at left
			for (let i = 0; i < height; i++) {
				newPawnPaths.push({
					startX: x,
					startZ: z + i,
					dirX: 1,
					dirZ: 0
				});
			}
			break;
		case 2: // Facing down - pawns at top
			for (let i = 0; i < width; i++) {
				newPawnPaths.push({
					startX: x + i,
					startZ: z + height - 1,
					dirX: 0,
					dirZ: 1
				});
			}
			break;
		case 3: // Facing left - pawns at right
			for (let i = 0; i < height; i++) {
				newPawnPaths.push({
					startX: x + width - 1,
					startZ: z + i,
					dirX: -1,
					dirZ: 0
				});
			}
			break;
	}
	
	// Count potential pawn clashes at clashDistance
	let clashCount = 0;
	
	for (const newPath of newPawnPaths) {
		// Calculate where this pawn would be after moving clashDistance spaces
		const newPathX = newPath.startX + (newPath.dirX * clashDistance);
		const newPathZ = newPath.startZ + (newPath.dirZ * clashDistance);
		
		// Check existing pawns for clash
		for (const existingPath of pawnPaths) {
			const existingPathX = existingPath.startX + (existingPath.dirX * clashDistance);
			const existingPathZ = existingPath.startZ + (existingPath.dirZ * clashDistance);
			
			// If positions match, we have a clash
			if (newPathX === existingPathX && newPathZ === existingPathZ) {
				clashCount++;
				// We need at least 2 clashes
				if (clashCount >= 2) {
					return true;
				}
			}
		}
	}
	
	// Not enough clashes found
	return false;
}

/**
 * Calculate a fallback position when no valid random position is found
 * @param {Array} existingHomeZones - Array of existing home zones
 * @param {number} boardWidth - Board width
 * @param {number} boardHeight - Board height 
 * @param {number} homeZoneWidth - Home zone width
 * @param {number} homeZoneHeight - Home zone height
 * @returns {Object} Position and orientation for the home zone
 */
function calculateFallbackPosition(existingHomeZones, boardWidth, boardHeight, homeZoneWidth, homeZoneHeight) {
	// Find furthest cell from center
	const centerX = boardWidth / 2;
	const centerZ = boardHeight / 2;
	let furthestDistance = 0;
	let furthestX = centerX;
	let furthestZ = centerZ;
	
	// Check all home zone cells
	for (const zone of existingHomeZones) {
		// Check corners and edges
		const points = [
			{ x: zone.x, z: zone.z },
			{ x: zone.x + zone.width - 1, z: zone.z },
			{ x: zone.x, z: zone.z + zone.height - 1 },
			{ x: zone.x + zone.width - 1, z: zone.z + zone.height - 1 }
		];
		
		for (const point of points) {
			const distance = Math.sqrt(
				Math.pow(point.x - centerX, 2) + 
				Math.pow(point.z - centerZ, 2)
			);
			
			if (distance > furthestDistance) {
				furthestDistance = distance;
				furthestX = point.x;
				furthestZ = point.z;
			}
		}
	}
	
	// Calculate placement 6 spaces out from furthest cell, facing center
	const angle = Math.atan2(centerZ - furthestZ, centerX - furthestX);
	
	// Convert angle to orientation (0-3)
	// 0: facing up, 1: facing right, 2: facing down, 3: facing left
	let orientation = Math.round(angle / (Math.PI / 2)) % 4;
	if (orientation < 0) orientation += 4;
	
	// Calculate position 6 spaces away from furthest cell
	const offsetX = Math.round(6 * Math.cos(angle));
	const offsetZ = Math.round(6 * Math.sin(angle));
	
	let x = furthestX + offsetX;
	let z = furthestZ + offsetZ;
	
	// Adjust position based on orientation to ensure pawns face the center
	switch (orientation) {
		case 0: // Facing up - pawns at bottom
			x = x - Math.floor(homeZoneWidth / 2);
			z = z - homeZoneHeight;
			break;
		case 1: // Facing right - pawns at left
			x = x - homeZoneWidth;
			z = z - Math.floor(homeZoneHeight / 2);
			break;
		case 2: // Facing down - pawns at top
			x = x - Math.floor(homeZoneWidth / 2);
			z = z;
			break;
		case 3: // Facing left - pawns at right
			x = x;
			z = z - Math.floor(homeZoneHeight / 2);
			break;
	}
	
	// Ensure coordinates are within board boundaries
	x = Math.max(0, Math.min(boardWidth - homeZoneWidth, Math.round(x)));
	z = Math.max(0, Math.min(boardHeight - homeZoneHeight, Math.round(z)));
	
	return {
		x,
		z,
		orientation
	};
}

/**
 * Generate home zones for all players
 * 
 * This function:
 * 1. Calculates the position and orientation for each player's home zone
 * 2. Creates the home zone cells in the game state
 * 3. Updates the gameState.homeZones object with zone information
 * 4. Places a board centre marker for reliable positioning reference
 * 
 * @param {Object} gameState - Game state object to update
 * @param {number} boardWidth - Board width
 * @param {number} boardHeight - Board height
 * @param {Object} players - Player data keyed by player ID
 * @returns {Object} Updated game state
 */
function generateHomeZones(gameState, boardWidth, boardHeight, players) {
	// Default to at least 2 players if none are provided
	const playerCount = players ? Object.keys(players).length : 2;
	const homeZoneWidth = 8; // Standard chess width
	const homeZoneHeight = 2; // Standard chess height
	
	// Generate home zones with controlled pawn clashing
	const homeZones = {};
	
	// For each player
	Object.keys(players).forEach((playerId, index) => {
		// Get position with controlled pawn clashing
		const homePosition = calculateHomePosition(
			index,
			gameState,
			boardWidth,
			boardHeight,
			homeZoneWidth,
			homeZoneHeight
		);
		
		// Store home zone information
		homeZones[playerId] = {
			x: homePosition.x,
			z: homePosition.z,
			width: homeZoneWidth,
			height: homeZoneHeight,
			orientation: homePosition.orientation
		};
		
		// Create home zone cells on the board
		for (let dz = 0; dz < homeZoneHeight; dz++) {
			for (let dx = 0; dx < homeZoneWidth; dx++) {
				const x = homePosition.x + dx;
				const z = homePosition.z + dz;
				
				// Ensure cells object exists
				if (!gameState.board.cells) {
					gameState.board.cells = {};
				}
				
				// Cell key in format "x,z"
				const cellKey = `${x},${z}`;
				
				// Create or update the cell
				gameState.board.cells[cellKey] = {
					type: 'homeZone',
					player: playerId
				};
			}
		}
	});
	
	// Store home zones in game state
	gameState.homeZones = homeZones;
	
	// Add a board centre marker that clients can use for consistent positioning
	const centreX = Math.floor(boardWidth / 2);
	const centreZ = Math.floor(boardHeight / 2);
	const centreKey = `${centreX},${centreZ}`;
	
	// Create or update the centre marker cell, preserving any existing content
	// This special cell should be kept and never removed - it's our anchor point
	gameState.board.cells[centreKey] = gameState.board.cells[centreKey] || {};
	
	// Attach a special marker that will be recognisable and preserved
	gameState.board.cells[centreKey].specialMarker = {
		type: 'boardCentre',
		isCentreMarker: true,
		centreX,
		centreZ
	};
	
	// Also record the centre point in the board properties for easy access
	gameState.board.centreMarker = {
		x: centreX,
		z: centreZ
	};
	
	return gameState;
}

/**
 * Create initial chess pieces for a player
 * 
 * This function places chess pieces in a player's home zone with the correct
 * orientation based on the home zone's position. The pieces are arranged differently
 * depending on whether the orientation is horizontal (0, 2) or vertical (1, 3).
 * 
 * For each orientation:
 * - 0: Pawns at bottom row, pieces face up
 * - 1: Pawns at leftmost column, pieces face right
 * - 2: Pawns at top row, pieces face down
 * - 3: Pawns at rightmost column, pieces face left
 * 
 * @param {Object} gameState - Game state to update
 * @param {string} playerId - Player ID
 * @returns {Object} Updated game state
 */
function createInitialChessPieces(gameState, playerId) {
	// Get home zone for this player
	const homeZone = gameState.homeZones[playerId];
	if (!homeZone) {
		console.error(`No home zone found for player ${playerId}`);
		return gameState;
	}
	
	// Standard chess piece arrangement
	const backRowPieces = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
	const frontRowPieces = Array(8).fill('PAWN');
	
	// Determine piece positioning based on home zone orientation
	let xOffset, zOffset, xDir, zDir;
	
	switch (homeZone.orientation) {
		case 0: // Facing up - pawns at bottom
			xOffset = 0; // Start from left side of zone
			zOffset = 0; // Start from bottom of zone (pawns row)
			xDir = 1;    // Move right along the row
			zDir = 1;    // Back row is one step up
			break;
			
		case 1: // Facing right - pawns at left
			xOffset = 0; // Start from left side (pawns column)
			zOffset = 0; // Start from top of zone
			xDir = 1;    // Back row is one step right
			zDir = 1;    // Move down along the column
			break;
			
		case 2: // Facing down - pawns at top
			xOffset = 7; // Start from right side of zone
			zOffset = 0; // Start from top of zone (pawns row)
			xDir = -1;   // Move left along the row
			zDir = 1;    // Back row is one step down
			break;
			
		case 3: // Facing left - pawns at right
			xOffset = 7; // Start from right side (pawns column)
			zOffset = 0; // Start from top of zone
			xDir = -1;   // Back row is one step left
			zDir = 1;    // Move down along the column
			break;
			
		default:
			xOffset = 0;
			zOffset = 0;
			xDir = 1;
			zDir = 1;
	}
	
	// Create pieces based on orientation
	if (homeZone.orientation === 0 || homeZone.orientation === 2) {
		// Horizontal layout (orientation 0 or 2)
		
		// Create pawns (front row)
		for (let i = 0; i < frontRowPieces.length; i++) {
			const x = homeZone.x + xOffset + (i * xDir);
			const z = homeZone.z + zOffset;
			
			addChessPiece(gameState, 'PAWN', x, z, playerId, homeZone.orientation);
		}
		
		// Create back row pieces
		for (let i = 0; i < backRowPieces.length; i++) {
			const x = homeZone.x + xOffset + (i * xDir);
			const z = homeZone.z + zOffset + zDir;
			
			addChessPiece(gameState, backRowPieces[i], x, z, playerId, homeZone.orientation);
		}
	} else {
		// Vertical layout (orientation 1 or 3)
		
		// Create pawns (front column)
		for (let i = 0; i < frontRowPieces.length; i++) {
			const x = homeZone.x + xOffset;
			const z = homeZone.z + zOffset + (i * zDir);
			
			addChessPiece(gameState, 'PAWN', x, z, playerId, homeZone.orientation);
		}
		
		// Create back column pieces
		for (let i = 0; i < backRowPieces.length; i++) {
			const x = homeZone.x + xOffset + xDir;
			const z = homeZone.z + zOffset + (i * zDir);
			
			addChessPiece(gameState, backRowPieces[i], x, z, playerId, homeZone.orientation);
		}
	}
	
	return gameState;
}

/**
 * Helper function to add a chess piece to the game state
 * 
 * This function:
 * 1. Adds the piece to the gameState.chessPieces array
 * 2. Updates the cell in gameState.board.cells
 * 
 * Both the piece and cell include the player ID and orientation data.
 * 
 * @param {Object} gameState - Game state to update
 * @param {string} pieceType - Type of piece
 * @param {number} x - X position
 * @param {number} z - Z position
 * @param {string} playerId - Player ID
 * @param {number} orientation - Orientation (0-3)
 */
function addChessPiece(gameState, pieceType, x, z, playerId, orientation) {
	// Add to chess pieces array
	if (!gameState.chessPieces) {
		gameState.chessPieces = [];
	}
	
	gameState.chessPieces.push({
		position: { x, z },
		type: pieceType,
		player: playerId,
		orientation: orientation
	});
	
	// Update board cell
	const cellKey = `${x},${z}`;
	gameState.board.cells[cellKey] = {
		type: 'chess',
		chessPiece: { type: pieceType },
		player: playerId
	};
}

// Export functions for use in server
module.exports = {
	calculateHomePosition,
	generateHomeZones,
	createInitialChessPieces
}; 