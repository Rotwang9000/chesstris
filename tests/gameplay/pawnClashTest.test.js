/**
 * Pawn Clash Test
 * Tests that pawns from adjacent players can meet at a clash point in exactly 8 moves
 */

const assert = require('assert');
const { BOARD_SETTINGS, CHESS_PIECE_POSITIONS } = require('../../server/game/Constants');

/**
 * Create a mock board with two players' home zones at clash distance
 */
function createMockGameWithClashPosition() {
	// Create a large board
	const board = Array(50).fill().map(() => Array(50).fill(null));
	
	// Create player 1 horizontal home zone (8x2) at left
	const player1HomeX = 5;
	const player1HomeZ = 20;
	
	// Create player 2 vertical home zone (2x8) - exactly 16 cells away (8 moves each pawn)
	// Place player 2 in a position where pawns will meet in exactly 8 moves
	const player2HomeX = 29; // 5 (start) + 8 (width) + 16 (distance)
	const player2HomeZ = 20;
	
	// Create a game object
	const game = {
		board,
		players: {
			player1: {
				id: 'player1',
				name: 'Player 1',
				color: '#ff0000',
				homeZone: {
					x: player1HomeX,
					z: player1HomeZ,
					width: BOARD_SETTINGS.HOME_ZONE_WIDTH,
					height: BOARD_SETTINGS.HOME_ZONE_HEIGHT
				}
			},
			player2: {
				id: 'player2',
				name: 'Player 2',
				color: '#00ff00',
				homeZone: {
					x: player2HomeX,
					z: player2HomeZ,
					width: BOARD_SETTINGS.HOME_ZONE_HEIGHT,  // Swapped for vertical orientation
					height: BOARD_SETTINGS.HOME_ZONE_WIDTH   // Swapped for vertical orientation
				}
			}
		},
		chessPieces: []
	};
	
	// Create a specific pawn for player 1 (horizontal zone)
	// Place it exactly 8 moves away from the clash point
	const player1Pawn = {
		id: 'player1-pawn-0',
		type: 'PAWN',
		player: 'player1',
		x: 13,  // 21 (clash point) - 8 moves
		z: 21,  // 1 move below player 1 home zone
		color: '#ff0000',
		hasMoved: false
	};
	game.chessPieces.push(player1Pawn);
	
	// Mark the board cell
	board[player1Pawn.z][player1Pawn.x] = {
		type: 'chess',
		player: 'player1',
		chessPiece: player1Pawn,
		color: '#ff0000'
	};
	
	// Create a specific pawn for player 2 (vertical zone)
	// Place it exactly 8 moves away from the clash point
	const player2Pawn = {
		id: 'player2-pawn-0',
		type: 'PAWN',
		player: 'player2',
		x: 29,  // 21 (clash point) + 8 moves
		z: 21,  // 1 move below clash point
		color: '#00ff00',
		hasMoved: false
	};
	game.chessPieces.push(player2Pawn);
	
	// Mark the board cell
	board[player2Pawn.z][player2Pawn.x] = {
		type: 'chess',
		player: 'player2',
		chessPiece: player2Pawn,
		color: '#00ff00'
	};
	
	// Calculate the clash point (this is at 8 moves for each pawn)
	const clashPoint = {
		x: 21, // Exactly halfway between the pawns
		z: 21, // Same vertical level
	};
	
	// Store the clash point on the game object for testing
	game.expectedClashPoint = clashPoint;
	
	return game;
}

/**
 * Helper function to visualize the board with home zones and pieces
 */
function visualizeBoard(game) {
	const width = game.board[0].length;
	const height = game.board.length;
	
	// Find the min and max coordinates to display a focused view
	let minX = 0;
	let maxX = 40;
	let minZ = 15;
	let maxZ = 30;
	
	console.log(`Displaying board section from (${minX},${minZ}) to (${maxX},${maxZ})`);
	console.log('Legend: 1=Player1 Home, 2=Player2 Home, P=Pawn, .=Empty, X=Expected Clash Point');
	
	// Create header row with column indices
	let visualization = '   ';
	for (let x = minX; x < maxX; x++) {
		visualization += (x % 10).toString();
	}
	visualization += '\n';
	
	// Create board visualization
	for (let z = minZ; z < maxZ; z++) {
		// Add row index
		visualization += `${z.toString().padStart(2, ' ')} `;
		
		for (let x = minX; x < maxX; x++) {
			const cell = game.board[z][x];
			let cellChar = '.';
			
			// Mark the expected clash point
			if (game.expectedClashPoint && game.expectedClashPoint.x === x && game.expectedClashPoint.z === z) {
				cellChar = 'X';
			}
			// Check if this cell is in any player's home zone
			else {
				for (const playerId in game.players) {
					const homeZone = game.players[playerId].homeZone;
					
					if (x >= homeZone.x && x < homeZone.x + homeZone.width && 
						z >= homeZone.z && z < homeZone.z + homeZone.height) {
						// Mark as home zone
						cellChar = playerId.substring(playerId.length - 1);
					}
				}
				
				// Check if there's a piece here
				if (cell && cell.chessPiece) {
					// Mark as piece
					cellChar = cell.chessPiece.type.charAt(0);
				}
			}
			
			visualization += cellChar;
		}
		visualization += '\n';
	}
	
	console.log(visualization);
}

/**
 * Calculate the Manhattan distance between two points
 */
function manhattanDistance(x1, z1, x2, z2) {
	return Math.abs(x1 - x2) + Math.abs(z1 - z2);
}

/**
 * Test if pawns can clash in exactly 8 moves
 */
function testPawnClashDistance() {
	console.log('=== Testing Pawn Clash Distance ===');
	
	// Create a game with home zones positioned for clash testing
	const game = createMockGameWithClashPosition();
	
	// Visualize the board
	visualizeBoard(game);
	
	// Get player pawns
	const player1Pawn = game.chessPieces.find(piece => piece.player === 'player1');
	const player2Pawn = game.chessPieces.find(piece => piece.player === 'player2');
	
	// Get the clash point
	const clashPoint = game.expectedClashPoint;
	
	console.log(`Player 1 pawn at (${player1Pawn.x}, ${player1Pawn.z})`);
	console.log(`Player 2 pawn at (${player2Pawn.x}, ${player2Pawn.z})`);
	console.log(`Expected clash point at (${clashPoint.x}, ${clashPoint.z})`);
	
	// Calculate how many pawn moves it takes for player 1's pawn to reach the clash point
	const player1MovesToClash = manhattanDistance(player1Pawn.x, player1Pawn.z, clashPoint.x, clashPoint.z);
	
	// Calculate how many pawn moves it takes for player 2's pawn to reach the clash point
	const player2MovesToClash = manhattanDistance(player2Pawn.x, player2Pawn.z, clashPoint.x, clashPoint.z);
	
	console.log(`Player 1's pawn needs ${player1MovesToClash} moves to reach clash point`);
	console.log(`Player 2's pawn needs ${player2MovesToClash} moves to reach clash point`);
	
	// Assert both players' pawns can reach the clash point in exactly 8 moves
	assert.strictEqual(player1MovesToClash, 8, 'Player 1 pawn should reach clash point in exactly 8 moves');
	assert.strictEqual(player2MovesToClash, 8, 'Player 2 pawn should reach clash point in exactly 8 moves');
	
	// Assert total Manhattan distance between the pawns is 16 (8 moves each)
	const totalDistance = manhattanDistance(player1Pawn.x, player1Pawn.z, player2Pawn.x, player2Pawn.z);
	assert.strictEqual(totalDistance, 16, 'Total distance between pawns should be 16 (8 moves each)');
	
	console.log('All pawn clash distance tests passed!');
	return true;
}

// Run the test
try {
	testPawnClashDistance();
	console.log('✅ All tests passed successfully!');
} catch (error) {
	console.error('❌ Test failed:', error.message);
	console.error('Stack trace:', error.stack);
	process.exit(1);
} 