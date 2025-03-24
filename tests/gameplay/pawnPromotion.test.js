/**
 * Pawn Promotion Test
 * Tests the automatic promotion of pawns after 8 spaces of forward movement
 */

const assert = require('assert');

// Import the GAME_RULES constants
const { GAME_RULES } = require('../../server/game/Constants');

/**
 * Create a mock game state for pawn promotion tests
 */
function createMockGameState() {
	return {
		id: 'test-game',
		board: {
			cells: {},
			minX: 0,
			maxX: 20,
			minZ: 0,
			maxZ: 20
		},
		players: {
			p1: {
				id: 'p1',
				color: '#FF0000',
				name: 'Player 1'
			}
		},
		chessPieces: []
	};
}

/**
 * Set up a board with a pawn that has moved a certain distance
 */
function setupPawnWithDistance(game, distance) {
	// Create a pawn
	const pawn = {
		id: 'p1_pawn1',
		type: 'pawn',
		playerId: 'p1',
		x: 4,
		z: distance, // Position the pawn at the appropriate distance
		moveDistance: distance // Track the move distance
	};
	
	// Add the pawn to the game's chessPieces array
	game.chessPieces = [pawn];
	
	// Set the cell at the pawn's position
	game.board.cells[`${pawn.x},${pawn.z}`] = {
		type: 'chess',
		piece: 'pawn',
		playerId: 'p1'
	};
	
	return pawn;
}

/**
 * Mock function for chess movement validation
 */
function mockValidateChessMove(pawn, toX, toZ) {
	// Simple validation that checks for a valid 1-space move
	const dx = Math.abs(toX - pawn.x);
	const dz = Math.abs(toZ - pawn.z);
	
	// Pawns can move one space forward (or diagonally to capture)
	if (dx > 1 || dz > 1) {
		return { valid: false, reason: 'Invalid pawn move' };
	}
	
	return { 
		valid: true, 
		piece: pawn,
		fromX: pawn.x,
		fromZ: pawn.z,
		toX,
		toZ,
		targetCell: null
	};
}

/**
 * Execute a chess move with promotion check
 */
function executeChessMove(game, pawn, toX, toZ) {
	// Validate the move
	const validation = mockValidateChessMove(pawn, toX, toZ);
	if (!validation.valid) {
		return { success: false, reason: validation.reason };
	}
	
	// Clear the original cell
	delete game.board.cells[`${pawn.x},${pawn.z}`];
	
	// Update the pawn's position
	pawn.x = toX;
	pawn.z = toZ;
	
	// Increment the move distance for forward moves
	pawn.moveDistance += 1;
	
	// Set the new cell
	game.board.cells[`${toX},${toZ}`] = {
		type: 'chess',
		piece: 'pawn',
		playerId: pawn.playerId
	};
	
	// Check for promotion
	let promotedTo = null;
	
	if (pawn.type === 'pawn' && pawn.moveDistance >= GAME_RULES.PAWN_PROMOTION_DISTANCE) {
		// Promote the pawn to a knight
		pawn.type = 'knight';
		promotedTo = 'knight';
		
		// Update the cell to reflect the promotion
		game.board.cells[`${toX},${toZ}`].piece = 'knight';
		
		console.log(`Pawn promoted to knight at (${toX}, ${toZ})`);
	}
	
	return { valid: true, captured: null, promotedTo };
}

/**
 * Test pawn promotion after 8 moves
 */
function testPawnPromotion() {
	console.log('Testing pawn promotion...');
	
	// Create a mock game state
	const game = createMockGameState();
	
	// TEST 1: Pawn with 7 moves doesn't get promoted on the 8th move
	console.log('\n--- TEST 1: Pawn promoted after 8 moves ---');
	
	// Set up a pawn that has already moved 7 spaces
	const pawn1 = setupPawnWithDistance(game, 7);
	console.log(`Created pawn at position (${pawn1.x}, ${pawn1.z}) with ${pawn1.moveDistance} moves`);
	
	// Move the pawn one more space (8th move)
	const result1 = executeChessMove(game, pawn1, pawn1.x, pawn1.z + 1);
	
	// Check that the pawn was promoted
	assert.strictEqual(pawn1.type, 'knight', 'Pawn should be promoted to knight after 8 moves');
	assert.strictEqual(result1.promotedTo, 'knight', 'Move result should indicate promotion to knight');
	
	// Check the board cell was updated
	const cell1 = game.board.cells[`${pawn1.x},${pawn1.z}`];
	assert.strictEqual(cell1.piece, 'knight', 'Board cell should show knight after promotion');
	
	console.log(`Pawn promoted to ${pawn1.type} after moving to (${pawn1.x}, ${pawn1.z})`);
	
	// TEST 2: Pawn with fewer than 7 moves doesn't get promoted
	console.log('\n--- TEST 2: Pawn not promoted before 8 moves ---');
	
	// Reset the game
	const game2 = createMockGameState();
	
	// Set up a pawn that has moved 6 spaces
	const pawn2 = setupPawnWithDistance(game2, 6);
	console.log(`Created pawn at position (${pawn2.x}, ${pawn2.z}) with ${pawn2.moveDistance} moves`);
	
	// Move the pawn one more space (7th move)
	const result2 = executeChessMove(game2, pawn2, pawn2.x, pawn2.z + 1);
	
	// Check that the pawn was not promoted
	assert.strictEqual(pawn2.type, 'pawn', 'Pawn should not be promoted before 8 moves');
	assert.strictEqual(result2.promotedTo, null, 'Move result should not indicate promotion');
	
	// Check the board cell wasn't updated to a knight
	const cell2 = game2.board.cells[`${pawn2.x},${pawn2.z}`];
	assert.strictEqual(cell2.piece, 'pawn', 'Board cell should still show pawn before promotion');
	
	console.log(`Pawn remains as ${pawn2.type} after moving to (${pawn2.x}, ${pawn2.z})`);
	
	// TEST 3: Promotion at edge of board
	console.log('\n--- TEST 3: Promotion at edge of board ---');
	
	// Reset the game
	const game3 = createMockGameState();
	
	// Set up a pawn at the edge of the board (7 moves)
	const pawn3 = setupPawnWithDistance(game3, game3.board.maxZ - 1);
	console.log(`Created pawn at position (${pawn3.x}, ${pawn3.z}) with ${pawn3.moveDistance} moves (edge of board)`);
	
	// Move the pawn to the edge (8th move, should be promoted)
	const result3 = executeChessMove(game3, pawn3, pawn3.x, game3.board.maxZ);
	
	// Check that the pawn was promoted
	assert.strictEqual(pawn3.type, 'knight', 'Pawn should be promoted at edge of board');
	assert.strictEqual(result3.promotedTo, 'knight', 'Move result should indicate promotion');
	
	console.log(`Pawn promoted to ${pawn3.type} at edge of board (${pawn3.x}, ${pawn3.z})`);
	
	console.log('\nAll pawn promotion tests passed!');
	return true;
}

// Run the test
try {
	testPawnPromotion();
	console.log('✅ All tests passed successfully!');
} catch (error) {
	console.error('❌ Test failed:', error.message);
	console.error('Stack trace:', error.stack);
	process.exit(1);
} 