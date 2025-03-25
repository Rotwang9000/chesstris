/**
 * Board Generator - Server-side implementation for Shaktris
 * Handles generation of the board layout including spiral home zone positioning
 * 
 * This module is responsible for:
 * 1. Calculating positions for home zones in a spiral pattern
 * 2. Generating the home zones for each player
 * 3. Creating chess pieces with the correct orientation
 * 
 * The implementation uses a sparse cell-based approach rather than a traditional 2D array.
 * Each cell is identified by a coordinate key in the format "x,z".
 */

/**
 * Calculate home zone positions in a spiral pattern
 * 
 * The spiral algorithm works as follows:
 * 1. Start with an initial radius from the center
 * 2. For each player, increase the radius based on the player's index
 * 3. Calculate angle around the center based on player index
 * 4. Determine orientation so pieces face the center
 * 5. Adjust position based on orientation and home zone dimensions
 * 
 * Special cases:
 * - Player 1 (index 0) is positioned close to the center
 * - Players 2-5 (index 1-4) get maximum separation with a large spiral factor
 * - Player 5 (index 4) gets additional offset to avoid overlap with Player 1
 * - Later players use a gradually decreasing spiral factor
 * 
 * @param {number} playerIndex - Player index (0-based)
 * @param {number} totalPlayers - Total number of players
 * @param {number} boardWidth - Board width
 * @param {number} boardHeight - Board height
 * @param {number} homeZoneWidth - Home zone width (typically 8 for chess)
 * @param {number} homeZoneHeight - Home zone height (typically 2 for chess)
 * @returns {Object} Position and orientation for the home zone
 */
function calculateSpiralHomePosition(playerIndex, totalPlayers, boardWidth, boardHeight, homeZoneWidth, homeZoneHeight) {
	// Center of the board
	const centerX = boardWidth / 2;
	const centerZ = boardHeight / 2;
	
	// Base spiral parameters - increased for steeper initial expansion
	const initialRadius = Math.min(boardWidth, boardHeight) / 3;
	
	// Each player gets positioned further out in the spiral
	// The spacing between players should decrease as we go further out
	// Use a smaller angle step for more players to create a tighter spiral
	const angleStep = (Math.PI * 2) / Math.min(totalPlayers, 8);
	
	// Calculate spiral factor - significantly increased to create more separation
	// Especially for the first 5 players
	let spiralFactor;
	if (playerIndex === 0) {
		// First player uses initial radius
		spiralFactor = 0;
	} else if (playerIndex < 5) {
		// First 4 players get maximum separation from player 1
		spiralFactor = 10;
	} else {
		// Players further out get gradually decreasing separation
		// But still maintain significant distance
		spiralFactor = Math.max(6, 10 - ((playerIndex - 5) * 0.5));
	}
	
	// Calculate radius for this player position
	// As playerIndex increases, each player is positioned further out
	const radius = initialRadius + (playerIndex * spiralFactor);
	
	// Calculate angle for this player (in radians)
	// Add small variation to prevent perfect alignments that could cause overlaps
	// Larger variation for later players to prevent overlap
	const variation = (playerIndex % 2 === 0) ? 
		(0.1 + (playerIndex * 0.02)) : 
		(-0.1 - (playerIndex * 0.02));
	const angle = (playerIndex * angleStep) + variation;
	
	// Calculate position on the spiral
	const x = centerX + radius * Math.cos(angle);
	const z = centerZ + radius * Math.sin(angle);
	
	// Calculate orientation - pieces should face towards the center
	// This angle determines which way the pawns are facing
	const facingAngle = Math.atan2(centerZ - z, centerX - x);
	
	// Normalize to get orientation index (0-3)
	// 0: facing up (pawns at bottom)
	// 1: facing right (pawns at left)
	// 2: facing down (pawns at top)
	// 3: facing left (pawns at right)
	let orientation = Math.round(facingAngle / (Math.PI / 2)) % 4;
	if (orientation < 0) orientation += 4;
	
	// For players that might be close to each other, force perpendicular orientations
	// to ensure some pawn clash as requested
	if (playerIndex > 0 && playerIndex % 4 === 0) {
		// Every 4th player after the first gets a perpendicular orientation
		orientation = (orientation + 1) % 4;
	}
	
	// Calculate final home zone coordinates
	// Adjust the position so the home zone is properly placed based on orientation
	let homeX = x;
	let homeZ = z;
	
	// Adjust position based on orientation to ensure pawns face the center
	switch (orientation) {
		case 0: // Facing up - pawns at bottom
			homeX = homeX - (homeZoneWidth / 2);
			homeZ = homeZ - homeZoneHeight;
			break;
		case 1: // Facing right - pawns at left
			homeX = homeX - homeZoneWidth;
			homeZ = homeZ - (homeZoneHeight / 2);
			break;
		case 2: // Facing down - pawns at top
			homeX = homeX - (homeZoneWidth / 2);
			homeZ = homeZ;
			break;
		case 3: // Facing left - pawns at right
			homeX = homeX;
			homeZ = homeZ - (homeZoneHeight / 2);
			break;
	}
	
	// Apply additional offset for player 5 specifically to avoid overlap with player 1
	if (playerIndex === 4) { // Index 4 = player 5
		// Get direction vector from center
		const dirX = Math.sign(homeX - centerX);
		const dirZ = Math.sign(homeZ - centerZ);
		// Apply extra offset in that direction
		homeX += dirX * 3;
		homeZ += dirZ * 3;
	}
	
	// Ensure coordinates are within board boundaries
	homeX = Math.max(0, Math.min(boardWidth - homeZoneWidth, Math.round(homeX)));
	homeZ = Math.max(0, Math.min(boardHeight - homeZoneHeight, Math.round(homeZ)));
	
	return {
		x: homeX,
		z: homeZ,
		orientation: orientation
	};
}

/**
 * Generate home zones for all players in a spiral pattern
 * 
 * This function:
 * 1. Calculates the position and orientation for each player's home zone
 * 2. Creates the home zone cells in the game state
 * 3. Updates the gameState.homeZones object with zone information
 * 
 * The board uses a sparse cell structure where only occupied cells are stored.
 * Each cell is identified by a key in the format "x,z".
 * 
 * @param {Object} gameState - Game state object to update
 * @param {number} boardWidth - Board width
 * @param {number} boardHeight - Board height
 * @param {Object} players - Player data keyed by player ID
 * @returns {Object} Updated game state
 */
function generateSpiralHomeZones(gameState, boardWidth, boardHeight, players) {
	// Default to at least 2 players if none are provided
	const playerCount = players ? Object.keys(players).length : 2;
	const homeZoneWidth = 8; // Standard chess width
	const homeZoneHeight = 2; // Standard chess height
	
	// Generate home zones in spiral pattern
	const homeZones = {};
	
	// For each player
	Object.keys(players).forEach((playerId, index) => {
		// Get spiral position (0-based player index)
		const spiralPosition = calculateSpiralHomePosition(
			index,
			playerCount,
			boardWidth,
			boardHeight,
			homeZoneWidth,
			homeZoneHeight
		);
		
		// Store home zone information
		homeZones[playerId] = {
			x: spiralPosition.x,
			z: spiralPosition.z,
			width: homeZoneWidth,
			height: homeZoneHeight,
			orientation: spiralPosition.orientation
		};
		
		// Create home zone cells on the board
		for (let dz = 0; dz < homeZoneHeight; dz++) {
			for (let dx = 0; dx < homeZoneWidth; dx++) {
				const x = spiralPosition.x + dx;
				const z = spiralPosition.z + dz;
				
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
	calculateSpiralHomePosition,
	generateSpiralHomeZones,
	createInitialChessPieces
}; 