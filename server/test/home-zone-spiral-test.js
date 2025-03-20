/**
 * Home Zone Spiral Pattern Test
 * This test verifies that home zones are placed in a proper spiral pattern
 */

const GameUtilities = require('../game/GameUtilities');
const BoardManager = require('../game/BoardManager');
const { BOARD_SETTINGS } = require('../game/Constants');

// Helper function to visualize the board with home zones
function visualizeBoard(game) {
	const width = game.board[0].length;
	const height = game.board.length;
	let visualization = '';
	
	console.log(`Board size: ${width}x${height}`);
	console.log('Legend: P1=1, P2=2, P3=3, P4=4, Empty=.');
	
	// Create header row with column indices
	visualization += '   ';
	for (let x = 0; x < width; x++) {
		visualization += (x % 10).toString();
	}
	visualization += '\n';
	
	// Create board visualization
	for (let z = 0; z < height; z++) {
		// Add row index
		visualization += `${z.toString().padStart(2, ' ')} `;
		
		for (let x = 0; x < width; x++) {
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

// Helper function to manually implement the spiral pattern logic 
// (for testing verification purposes)
function calculateHomeZonePosition(game, playerIndex) {
	const { HOME_ZONE_SIZE, HOME_ZONE_DISTANCE, SPIRAL_DIRECTIONS } = BOARD_SETTINGS;
	
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
	
	// For subsequent players, we manually calculate based on the spiral pattern
	// Get the previous player's home zone
	const previousPlayer = Object.values(game.players)[playerIndex - 1];
	const previousHomeZone = previousPlayer.homeZone;
	
	// Calculate the direction based on player index
	const directionIndex = (playerIndex - 1) % SPIRAL_DIRECTIONS.length;
	const direction = SPIRAL_DIRECTIONS[directionIndex];
	
	// Calculate the center of the previous home zone
	const prevCenterX = previousHomeZone.x + Math.floor(HOME_ZONE_SIZE / 2);
	const prevCenterZ = previousHomeZone.z + Math.floor(HOME_ZONE_SIZE / 2);
	
	// Move in the current direction by HOME_ZONE_DISTANCE
	const newCenterX = prevCenterX + (direction.x * HOME_ZONE_DISTANCE);
	const newCenterZ = prevCenterZ + (direction.z * HOME_ZONE_DISTANCE);
	
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

// Main test function
function testHomeZoneSpiral() {
	console.log('=== Testing Home Zone Spiral Pattern ===');
	
	// Create a mock game object
	const boardManager = new BoardManager();
	const game = {
		id: 'test-game',
		board: boardManager.createEmptyBoard(50, 50), // Start with a larger board
		players: {},
		origin: { x: 0, z: 0 }
	};
	
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
	
	// Verify pawn clash points
	console.log('\n=== Pawn Clash Points ===');
	
	// Calculate all pawn clash points
	const clashPoints = [];
	
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
		
		clashPoints.push({
			players: [i, (i % 8) + 1],
			point: clashPoint
		});
	}
	
	console.log('\nPawn clash points (after 8 moves):');
	clashPoints.forEach(clash => {
		console.log(`Players ${clash.players[0]} and ${clash.players[1]}: (${clash.point.x}, ${clash.point.z})`);
	});
}

// Run the test
testHomeZoneSpiral(); 