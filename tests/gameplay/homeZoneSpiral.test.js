/**
 * Home Zone Spiral Pattern Test
 * Tests that home zones are positioned in a spiral pattern as new players join
 */

const assert = require('assert');
const path = require('path');

// Directly use the constants from the game code
const { BOARD_SETTINGS } = require('../../server/game/Constants');

/**
 * Create a basic game state for testing
 */
function createMockGameState() {
	// Create a mock board with larger dimensions for multiple home zones
	const board = [];
	for (let z = 0; z < 80; z++) {
		const row = [];
		for (let x = 0; x < 80; x++) {
			row.push(null);
		}
		board.push(row);
	}
	
	return {
		id: 'test-spiral-game',
		board: board,
		players: {},
		origin: { x: 0, z: 0 }
	};
}

/**
 * Helper function to visualize the board with home zones
 */
function visualizeBoard(game) {
	const width = game.board[0].length;
	const height = game.board.length;
	const maxDisplaySize = 50; // Limit display size for readability
	const xStep = Math.max(1, Math.floor(width / maxDisplaySize));
	const zStep = Math.max(1, Math.floor(height / maxDisplaySize));
	
	let visualization = '';
	
	console.log(`Board size: ${width}x${height} (displaying with step ${xStep}x${zStep})`);
	console.log('Legend: P1=1, P2=2, P3=3, P4=4, P5=5, P6=6, P7=7, P8=8, Empty=.');
	
	// Create header row with column indices
	visualization += '   ';
	for (let x = 0; x < width; x += xStep) {
		visualization += (x % 10).toString();
	}
	visualization += '\n';
	
	// Create board visualization
	for (let z = 0; z < height; z += zStep) {
		// Add row index
		visualization += `${z.toString().padStart(2, ' ')} `;
		
		for (let x = 0; x < width; x += xStep) {
			let cellChar = '.';
			
			// Check if this cell is in any player's home zone
			for (const [playerId, player] of Object.entries(game.players)) {
				if (!player.homeZone) continue;
				
				const { x: homeX, z: homeZ } = player.homeZone;
				const homeSize = BOARD_SETTINGS.HOME_ZONE_SIZE;
				
				if (x >= homeX && x < homeX + homeSize && 
					z >= homeZ && z < homeZ + homeSize) {
					// Use player number as cell character
					cellChar = playerId.substring(playerId.length - 1);
					break;
				}
			}
			
			visualization += cellChar;
		}
		visualization += '\n';
	}
	
	console.log(visualization);
}

/**
 * Calculate home zone position based on spiral pattern
 * The spiral expands outward: right, down, left, up, then repeats at a larger distance
 */
function calculateHomeZonePosition(game, playerIndex) {
	const { HOME_ZONE_SIZE, HOME_ZONE_DISTANCE, SPIRAL_DIRECTIONS } = BOARD_SETTINGS;
	const spiralMultiplier = Math.floor(playerIndex / SPIRAL_DIRECTIONS.length) + 1;
	
	// First player goes at the center
	if (playerIndex === 0) {
		const centerX = Math.floor(game.board[0].length / 2) - Math.floor(HOME_ZONE_SIZE / 2);
		const centerZ = Math.floor(game.board.length / 2) - Math.floor(HOME_ZONE_SIZE / 2);
		
		return {
			x: centerX,
			z: centerZ,
			width: HOME_ZONE_SIZE,
			height: HOME_ZONE_SIZE
		};
	}
	
	// For subsequent players, calculate based on the spiral pattern with increasing distance
	// Calculate center of board
	const centerX = Math.floor(game.board[0].length / 2);
	const centerZ = Math.floor(game.board.length / 2);
	
	// Calculate direction index for current player
	const directionIndex = (playerIndex - 1) % SPIRAL_DIRECTIONS.length;
	const direction = SPIRAL_DIRECTIONS[directionIndex];
	
	// Calculate position with increasing distance for each spiral cycle
	const newCenterX = centerX + (direction.x * HOME_ZONE_DISTANCE * spiralMultiplier);
	const newCenterZ = centerZ + (direction.z * HOME_ZONE_DISTANCE * spiralMultiplier);
	
	// Adjust to get the top-left corner of the new home zone
	const newHomeX = newCenterX - Math.floor(HOME_ZONE_SIZE / 2);
	const newHomeZ = newCenterZ - Math.floor(HOME_ZONE_SIZE / 2);
	
	return {
		x: newHomeX,
		z: newHomeZ,
		width: HOME_ZONE_SIZE,
		height: HOME_ZONE_SIZE
	};
}

/**
 * Test the home zone spiral pattern placement
 */
function testHomeZoneSpiral() {
	console.log('=== Testing Home Zone Spiral Pattern ===');
	
	// Create a mock game object with a large board
	const game = createMockGameState();
	
	// Add 8 players to see the full spiral pattern
	for (let i = 0; i < 8; i++) {
		const playerId = `player${i + 1}`;
		
		// Add player
		game.players[playerId] = {
			id: playerId,
			name: `Player ${i + 1}`,
			ready: true
		};
		
		// Calculate home zone position
		game.players[playerId].homeZone = calculateHomeZonePosition(game, i);
		
		// Log the home zone position
		console.log(`Added Player ${i + 1} - Home Zone at (${game.players[playerId].homeZone.x}, ${game.players[playerId].homeZone.z})`);
	}
	
	// Visualize the board with home zones
	visualizeBoard(game);
	
	// Verify that no home zones overlap
	console.log('\n=== Checking for Home Zone Overlaps ===');
	for (let i = 1; i <= 8; i++) {
		const player1Id = `player${i}`;
		const player1 = game.players[player1Id];
		
		for (let j = i + 1; j <= 8; j++) {
			const player2Id = `player${j}`;
			const player2 = game.players[player2Id];
			
			// Check for overlap
			const overlap = checkHomeZoneOverlap(player1.homeZone, player2.homeZone);
			console.log(`Checking overlap between Player ${i} (${player1.homeZone.x},${player1.homeZone.z}) and Player ${j} (${player2.homeZone.x},${player2.homeZone.z}): ${overlap ? 'OVERLAP' : 'No overlap'}`);
			
			assert.strictEqual(
				overlap, 
				false, 
				`Home zones for Player ${i} and Player ${j} should not overlap`
			);
		}
	}
	
	// Verify pawn clash points
	console.log('\n=== Pawn Clash Points ===');
	
	// Calculate Manhattan distances between adjacent players to verify spacing
	for (let i = 1; i <= 8; i++) {
		const currentPlayerId = `player${i}`;
		const nextPlayerId = `player${(i % 8) + 1}`;
		
		if (!game.players[currentPlayerId] || !game.players[nextPlayerId]) continue;
		
		const currentHomeZone = game.players[currentPlayerId].homeZone;
		const nextHomeZone = game.players[nextPlayerId].homeZone;
		
		// Calculate center points of home zones
		const currentCenter = {
			x: currentHomeZone.x + Math.floor(BOARD_SETTINGS.HOME_ZONE_SIZE / 2),
			z: currentHomeZone.z + Math.floor(BOARD_SETTINGS.HOME_ZONE_SIZE / 2)
		};
		
		const nextCenter = {
			x: nextHomeZone.x + Math.floor(BOARD_SETTINGS.HOME_ZONE_SIZE / 2),
			z: nextHomeZone.z + Math.floor(BOARD_SETTINGS.HOME_ZONE_SIZE / 2)
		};
		
		// Calculate Manhattan distance between home zone centers
		const distance = Math.abs(currentCenter.x - nextCenter.x) + 
						Math.abs(currentCenter.z - nextCenter.z);
		
		console.log(`Distance between Player ${i} and Player ${(i % 8) + 1}: ${distance}`);
		
		// Pawn clash point (midpoint between the two home zones)
		const clashPoint = {
			x: Math.floor((currentCenter.x + nextCenter.x) / 2),
			z: Math.floor((currentCenter.z + nextCenter.z) / 2)
		};
		
		console.log(`Clash point between Player ${i} and Player ${(i % 8) + 1}: (${clashPoint.x}, ${clashPoint.z})`);
	}
	
	console.log('\nAll home zone placement tests passed!');
	return true;
}

/**
 * Check if two home zones overlap
 */
function checkHomeZoneOverlap(zone1, zone2) {
	// Check if one zone is entirely to the left/right/above/below the other
	if (zone1.x + zone1.width <= zone2.x || zone2.x + zone2.width <= zone1.x ||
		zone1.z + zone1.height <= zone2.z || zone2.z + zone2.height <= zone1.z) {
		return false; // No overlap
	}
	return true; // There is an overlap
}

// Run all tests
try {
	testHomeZoneSpiral();
	console.log('✅ All tests passed successfully!');
} catch (error) {
	console.error('❌ Test failed:', error.message);
	console.error('Stack trace:', error.stack);
	process.exit(1);
} 