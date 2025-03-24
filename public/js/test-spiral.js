// Test file for spiral layout calculation
import * as THREE from './utils/three.module.js';

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

// Test the spiral layout with 5 players on a 32x32 board
const boardWidth = 32;
const boardHeight = 32;
const homeZoneWidth = 8;
const homeZoneHeight = 2;
const totalPlayers = 5;

console.log("Testing spiral layout for 5 players:");
for (let playerIndex = 0; playerIndex < totalPlayers; playerIndex++) {
	const position = calculateSpiralHomePosition(
		playerIndex,
		totalPlayers,
		boardWidth,
		boardHeight,
		homeZoneWidth,
		homeZoneHeight
	);
	console.log(`Player ${playerIndex + 1}: x=${position.x}, z=${position.z}, orientation=${position.orientation}`);
} 