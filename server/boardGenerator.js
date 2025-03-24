/**
 * Board Generator - Server-side implementation for Shaktris
 * Handles generation of the board layout including spiral home zone positioning
 */

/**
 * Calculate home zone positions in a spiral pattern
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
	
	// Base spiral parameters
	const initialRadius = Math.min(boardWidth, boardHeight) / 4;
	
	// Each player gets positioned further out in the spiral
	// The spacing between players should decrease as we go further out
	const angleStep = (Math.PI * 2) / totalPlayers;
	
	// Calculate spiral factor - reduce distance between arms as we go out
	// This ensures the spiral doesn't expand too quickly
	const spiralFactor = Math.max(2, 3 - (playerIndex * 0.2));
	
	// Calculate radius for this player position
	// As playerIndex increases, each player is positioned slightly further out
	const radius = initialRadius + (playerIndex * spiralFactor);
	
	// Calculate angle for this player (in radians)
	const angle = playerIndex * angleStep;
	
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
 * @param {Object} gameState - Game state object to update
 * @param {number} boardWidth - Board width
 * @param {number} boardHeight - Board height
 * @param {Object} players - Player data keyed by player ID
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
 * @param {Object} gameState - Game state to update
 * @param {string} playerId - Player ID
 */
function createInitialChessPieces(gameState, playerId) {
	// Get home zone for this player
	const homeZone = gameState.homeZones[playerId];
	if (!homeZone) {
		console.error(`No home zone found for player ${playerId}`);
		return gameState;
	}
	
	// Standard chess piece arrangement
	const backRowPieces = ['KING', 'QUEEN', 'BISHOP', 'KNIGHT', 'ROOK', 'BISHOP', 'KNIGHT', 'ROOK'];
	const frontRowPieces = Array(8).fill('PAWN');
	
	// Determine piece positioning based on home zone orientation
	let xOffset, zOffset, xDir, zDir;
	
	switch (homeZone.orientation) {
		case 0: // Facing up - pawns at front (bottom)
			xOffset = 0;
			zOffset = 0;
			xDir = 1;
			zDir = 1;
			break;
		case 1: // Facing right - pawns at front (left)
			xOffset = 0;
			zOffset = 0;
			xDir = 1;
			zDir = 1;
			break;
		case 2: // Facing down - pawns at front (top)
			xOffset = 7;
			zOffset = 1;
			xDir = -1;
			zDir = -1;
			break;
		case 3: // Facing left - pawns at front (right)
			xOffset = 7;
			zOffset = 1;
			xDir = -1;
			zDir = -1;
			break;
		default:
			xOffset = 0;
			zOffset = 0;
			xDir = 1;
			zDir = 1;
	}
	
	// Create pawns (front row)
	for (let i = 0; i < frontRowPieces.length; i++) {
		const x = homeZone.x + xOffset + (i * xDir);
		const z = homeZone.z + zOffset;
		
		// Add to chess pieces array
		if (!gameState.chessPieces) {
			gameState.chessPieces = [];
		}
		
		gameState.chessPieces.push({
			position: { x, z },
			type: 'PAWN',
			player: playerId,
			orientation: homeZone.orientation
		});
		
		// Update board cell
		const cellKey = `${x},${z}`;
		gameState.board.cells[cellKey] = {
			type: 'chess',
			chessPiece: { type: 'PAWN' },
			player: playerId
		};
	}
	
	// Create back row pieces
	for (let i = 0; i < backRowPieces.length; i++) {
		const x = homeZone.x + xOffset + (i * xDir);
		const z = homeZone.z + zOffset + zDir;
		
		gameState.chessPieces.push({
			position: { x, z },
			type: backRowPieces[i],
			player: playerId,
			orientation: homeZone.orientation
		});
		
		// Update board cell
		const cellKey = `${x},${z}`;
		gameState.board.cells[cellKey] = {
			type: 'chess',
			chessPiece: { type: backRowPieces[i] },
			player: playerId
		};
	}
	
	return gameState;
}

// Export functions for use in server
module.exports = {
	calculateSpiralHomePosition,
	generateSpiralHomeZones,
	createInitialChessPieces
}; 