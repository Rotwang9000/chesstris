/**
 * Test utilities for Chesstris
 */

// Import necessary functions
// const { checkTetrominoCollision, isTetrominoAdjacentToExistingCells } = require('../public/js/enhanced-gameCore');

/**
 * Test Tetromino Collision
 * Tests the collision detection for tetrominos on a board
 */
function testTetrominoCollision() {
	console.log("Running tetromino collision tests...");
	
	// Mock board with some occupied cells
	const mockBoard = [
		[0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0],
		[0, 0, 1, 0, 0],
		[0, 1, 1, 1, 0],
		[0, 0, 0, 0, 0]
	];
	
	// Mock tetromino shape (T-shape)
	const tetrominoShape = [
		[0, 1, 0],
		[1, 1, 1]
	];
	
	// Test cases (posX, posZ, expectedResult)
	const testCases = [
		{ posX: 0, posZ: 0, expected: false, description: "No collision at top-left" },
		{ posX: 1, posZ: 2, expected: true, description: "Collision with existing piece" },
		{ posX: 2, posZ: 1, expected: true, description: "Partial collision" },
		{ posX: 3, posZ: 0, expected: false, description: "No collision at top-right" }
	];
	
	// Run tests
	testCases.forEach(test => {
		const result = mockCheckTetrominoCollision(
			mockBoard,
			tetrominoShape,
			test.posX,
			test.posZ
		);
		
		const passed = result === test.expected;
		console.log(`${passed ? "✓" : "✗"} ${test.description}: ${passed ? "PASS" : "FAIL"}`);
		
		if (!passed) {
			console.error(`  Expected: ${test.expected}, Got: ${result}`);
		}
	});
	
	console.log("Tetromino collision tests complete");
}

/**
 * Test Tetromino Adjacency
 * Tests if tetrominos are correctly detected as adjacent to existing cells
 */
function testTetrominoAdjacency() {
	console.log("Running tetromino adjacency tests...");
	
	// Mock board with some player cells
	const mockBoard = [
		[0, 0, 0, 0, 0],
		[0, 0, 0, 0, 0],
		[0, 0, 1, 0, 0],
		[0, 1, 1, 1, 0],
		[0, 0, 0, 0, 0]
	];
	
	// Mock tetromino shape (2x2 square)
	const tetrominoShape = [
		[1, 1],
		[1, 1]
	];
	
	// Test cases (posX, posZ, expectedResult)
	const testCases = [
		{ posX: 0, posZ: 0, expected: false, description: "Not adjacent to any player cells" },
		{ posX: 0, posZ: 2, expected: true, description: "Adjacent to player cell on right" },
		{ posX: 3, posZ: 2, expected: true, description: "Adjacent to player cell on left" },
		{ posX: 1, posZ: 0, expected: true, description: "Adjacent to player cell below" },
		{ posX: 1, posZ: 4, expected: true, description: "Adjacent to player cell above" }
	];
	
	// Set currentPlayer for adjacency check
	const currentPlayer = 1;
	
	// Run tests
	testCases.forEach(test => {
		const result = mockIsTetrominoAdjacentToExistingCells(
			mockBoard,
			tetrominoShape,
			test.posX,
			test.posZ,
			currentPlayer
		);
		
		const passed = result === test.expected;
		console.log(`${passed ? "✓" : "✗"} ${test.description}: ${passed ? "PASS" : "FAIL"}`);
		
		if (!passed) {
			console.error(`  Expected: ${test.expected}, Got: ${result}`);
		}
	});
	
	console.log("Tetromino adjacency tests complete");
}

/**
 * Mock implementations of game functions for testing
 */
function mockCheckTetrominoCollision(board, shape, posX, posZ) {
	// Check each block in the tetromino
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// Check if this position on the board is already occupied
				if (board[boardZ] && board[boardZ][boardX] !== 0) {
					return true; // Collision
				}
			}
		}
	}
	
	return false; // No collision
}

function mockIsTetrominoAdjacentToExistingCells(board, shape, posX, posZ, currentPlayer) {
	// For each block in the tetromino, check if it has an adjacent occupied cell
	for (let z = 0; z < shape.length; z++) {
		for (let x = 0; x < shape[z].length; x++) {
			if (shape[z][x] === 1) {
				const boardX = posX + x;
				const boardZ = posZ + z;
				
				// Check adjacent positions (left, right, up, down)
				const adjacentPositions = [
					{ x: boardX - 1, z: boardZ },
					{ x: boardX + 1, z: boardZ },
					{ x: boardX, z: boardZ - 1 },
					{ x: boardX, z: boardZ + 1 }
				];
				
				// Check if any adjacent position contains a cell belonging to the current player
				for (const pos of adjacentPositions) {
					// Skip positions outside the board
					if (pos.x < 0 || pos.z < 0 || pos.z >= board.length || pos.x >= board[0].length) {
						continue;
					}
					
					// If this cell belongs to the current player, we have adjacency
					if (board[pos.z][pos.x] === currentPlayer) {
						return true;
					}
				}
			}
		}
	}
	
	// No adjacency found
	return false;
}

// Export test functions
module.exports = {
	testTetrominoCollision,
	testTetrominoAdjacency
};

// Run tests if this file is executed directly
if (require.main === module) {
	testTetrominoCollision();
	testTetrominoAdjacency();
} 