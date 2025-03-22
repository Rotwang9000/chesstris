/**
 * Island Connectivity Test
 * Tests the mechanics of island connectivity validation in Shaktris
 * 
 * In Shaktris, cells must have a path back to the player's king to be valid.
 * This test ensures that the island connectivity validation works correctly.
 */

const assert = require('assert');

/**
 * Create a mock board for testing
 * @param {number} width - Board width
 * @param {number} height - Board height
 * @returns {Array} Mock board
 */
function createMockBoard(width, height) {
	const board = [];
	for (let z = 0; z < height; z++) {
		const row = [];
		for (let x = 0; x < width; x++) {
			row.push(null);
		}
		board.push(row);
	}
	return board;
}

/**
 * Set cell on the mock board
 * @param {Array} board - The mock board
 * @param {number} x - X coordinate
 * @param {number} z - Z coordinate
 * @param {Object} value - Cell value
 */
function setCell(board, x, z, value) {
	if (x >= 0 && x < board[0].length && z >= 0 && z < board.length) {
		board[z][x] = value;
	}
}

/**
 * Minimal mock of the IslandManager
 */
class IslandManager {
	constructor() {
		// No properties needed for initialization
	}

	/**
	 * Check if there is a path from a cell to the player's king
	 * @param {Object} game - The game object
	 * @param {number} startX - Starting X coordinate
	 * @param {number} startZ - Starting Z coordinate
	 * @param {string} playerId - The player's ID
	 * @returns {boolean} True if there is a path
	 */
	hasPathToKing(game, startX, startZ, playerId) {
		// Get the king's position for this player
		let kingX = -1;
		let kingZ = -1;

		// Find the king in chess pieces
		for (const piece of game.chessPieces) {
			if (piece.player === playerId && piece.type === 'king') {
				kingX = piece.x;
				kingZ = piece.z;
				break;
			}
		}

		if (kingX === -1 || kingZ === -1) {
			// King might not exist yet or might have been captured
			return false;
		}

		// Breadth-first search (BFS) to find a path to the king
		const queue = [{ x: startX, z: startZ }];
		const visited = new Set();
		const boardWidth = game.board[0].length;
		const boardHeight = game.board.length;

		// Mark the starting point as visited
		visited.add(`${startX},${startZ}`);

		while (queue.length > 0) {
			const { x, z } = queue.shift();

			// Check if we've reached the king
			if (x === kingX && z === kingZ) {
				return true;
			}

			// Check adjacent cells (in XZ plane)
			const adjacentCells = [
				{ x: x - 1, z },  // left
				{ x: x + 1, z },  // right
				{ x, z: z - 1 },  // up
				{ x, z: z + 1 }   // down
			];

			for (const cell of adjacentCells) {
				// Skip if out of bounds
				if (cell.x < 0 || cell.x >= boardWidth || cell.z < 0 || cell.z >= boardHeight) {
					continue;
				}

				// Skip if already visited
				const cellKey = `${cell.x},${cell.z}`;
				if (visited.has(cellKey)) {
					continue;
				}

				// Check if the cell belongs to the player
				const boardCell = game.board[cell.z][cell.x];
				if (boardCell && boardCell.player === playerId) {
					visited.add(cellKey);
					queue.push(cell);
				}
			}
		}

		// No path found
		return false;
	}

	/**
	 * Helper to visually log the board state
	 * @param {Array} board - The board to display
	 */
	logBoard(board) {
		console.log('Board state:');
		for (let z = 0; z < board.length; z++) {
			let row = '';
			for (let x = 0; x < board[z].length; x++) {
				const cell = board[z][x];
				if (!cell) {
					row += '. ';
				} else if (cell.type === 'chess') {
					// Use first letter of chess piece type
					const symbol = cell.piece.charAt(0).toUpperCase();
					row += `${symbol} `;
				} else {
					// Use player ID for regular cells
					row += `${cell.player} `;
				}
			}
			console.log(row);
		}
		console.log('');
	}
}

/**
 * Test island connectivity validation
 */
function testIslandConnectivity() {
	console.log('Testing island connectivity validation...');
	
	const islandManager = new IslandManager();
	
	// TEST 1: Simple path to king
	console.log('\n--- TEST 1: Simple path to king ---');
	
	// Create a 10x10 board
	const board1 = createMockBoard(10, 10);
	
	// Set up a simple path from (5,5) to the king at (0,0)
	setCell(board1, 0, 0, { player: 'p1', type: 'chess', piece: 'king' });
	setCell(board1, 1, 0, { player: 'p1' });
	setCell(board1, 2, 0, { player: 'p1' });
	setCell(board1, 3, 0, { player: 'p1' });
	setCell(board1, 3, 1, { player: 'p1' });
	setCell(board1, 3, 2, { player: 'p1' });
	setCell(board1, 4, 2, { player: 'p1' });
	setCell(board1, 5, 2, { player: 'p1' });
	setCell(board1, 5, 3, { player: 'p1' });
	setCell(board1, 5, 4, { player: 'p1' });
	setCell(board1, 5, 5, { player: 'p1' });
	
	// Create a game object
	const game1 = {
		board: board1,
		chessPieces: [
			{ player: 'p1', type: 'king', x: 0, z: 0 }
		]
	};
	
	// Visualize the board
	islandManager.logBoard(board1);
	
	// Check if there's a path from (5,5) to the king
	const hasPath1 = islandManager.hasPathToKing(game1, 5, 5, 'p1');
	console.log(`Path from (5,5) to king at (0,0): ${hasPath1}`);
	
	// Assertions
	assert.strictEqual(hasPath1, true, 'Should have a path to the king');
	
	// TEST 2: No path to king (disconnected)
	console.log('\n--- TEST 2: No path to king (disconnected) ---');
	
	// Create a 10x10 board
	const board2 = createMockBoard(10, 10);
	
	// Set up a king at (0,0)
	setCell(board2, 0, 0, { player: 'p1', type: 'chess', piece: 'king' });
	setCell(board2, 1, 0, { player: 'p1' });
	setCell(board2, 2, 0, { player: 'p1' });
	
	// Set up a disconnected island at (5,5)
	setCell(board2, 5, 5, { player: 'p1' });
	setCell(board2, 6, 5, { player: 'p1' });
	setCell(board2, 5, 6, { player: 'p1' });
	
	// Create a game object
	const game2 = {
		board: board2,
		chessPieces: [
			{ player: 'p1', type: 'king', x: 0, z: 0 }
		]
	};
	
	// Visualize the board
	islandManager.logBoard(board2);
	
	// Check if there's a path from (5,5) to the king
	const hasPath2 = islandManager.hasPathToKing(game2, 5, 5, 'p1');
	console.log(`Path from (5,5) to king at (0,0): ${hasPath2}`);
	
	// Assertions
	assert.strictEqual(hasPath2, false, 'Should NOT have a path to the king');
	
	// TEST 3: Path through enemy territory (should fail)
	console.log('\n--- TEST 3: Path through enemy territory (should fail) ---');
	
	// Create a 10x10 board
	const board3 = createMockBoard(10, 10);
	
	// Set up a king at (0,0) for player 1
	setCell(board3, 0, 0, { player: 'p1', type: 'chess', piece: 'king' });
	setCell(board3, 1, 0, { player: 'p1' });
	setCell(board3, 2, 0, { player: 'p1' });
	
	// Set up enemy territory blocking the path
	setCell(board3, 3, 0, { player: 'p2' });
	setCell(board3, 3, 1, { player: 'p2' });
	setCell(board3, 3, 2, { player: 'p2' });
	
	// Set up player 1 territory past the enemy
	setCell(board3, 4, 2, { player: 'p1' });
	setCell(board3, 5, 2, { player: 'p1' });
	setCell(board3, 5, 3, { player: 'p1' });
	setCell(board3, 5, 4, { player: 'p1' });
	setCell(board3, 5, 5, { player: 'p1' });
	
	// Create a game object
	const game3 = {
		board: board3,
		chessPieces: [
			{ player: 'p1', type: 'king', x: 0, z: 0 },
			{ player: 'p2', type: 'king', x: 8, z: 8 }
		]
	};
	
	// Visualize the board
	islandManager.logBoard(board3);
	
	// Check if there's a path from (5,5) to the king
	const hasPath3 = islandManager.hasPathToKing(game3, 5, 5, 'p1');
	console.log(`Path from (5,5) to king at (0,0): ${hasPath3}`);
	
	// Assertions
	assert.strictEqual(hasPath3, false, 'Should NOT have a path through enemy territory');
	
	// TEST 4: Multiple kings (should find path to nearest king)
	console.log('\n--- TEST 4: Path to nearest king ---');
	
	// Create a 10x10 board
	const board4 = createMockBoard(10, 10);
	
	// Set up the king at (9,9) with a direct path from (6,6)
	setCell(board4, 9, 9, { player: 'p1', type: 'chess', piece: 'king' });
	setCell(board4, 8, 9, { player: 'p1' });
	setCell(board4, 7, 9, { player: 'p1' });
	setCell(board4, 6, 9, { player: 'p1' });
	setCell(board4, 6, 8, { player: 'p1' });
	setCell(board4, 6, 7, { player: 'p1' });
	setCell(board4, 6, 6, { player: 'p1' });
	
	// Create a game object
	const game4 = {
		board: board4,
		chessPieces: [
			{ player: 'p1', type: 'king', x: 9, z: 9 }
		]
	};
	
	// Visualize the board
	islandManager.logBoard(board4);
	
	// Check if there's a path from (6,6) to the king
	const hasPath4 = islandManager.hasPathToKing(game4, 6, 6, 'p1');
	console.log(`Path from (6,6) to king at (9,9): ${hasPath4}`);
	
	// Assertions
	assert.strictEqual(hasPath4, true, 'Should have a path to the king');

	// TEST 5: Multiple paths to king
	console.log('\n--- TEST 5: Multiple paths to king ---');
	
	// Create a 10x10 board
	const board5 = createMockBoard(10, 10);
	
	// Set up a king at (5,5)
	setCell(board5, 5, 5, { player: 'p1', type: 'chess', piece: 'king' });
	
	// Set up multiple paths to the king
	// Path 1: Left
	setCell(board5, 4, 5, { player: 'p1' });
	setCell(board5, 3, 5, { player: 'p1' });
	setCell(board5, 2, 5, { player: 'p1' });
	setCell(board5, 1, 5, { player: 'p1' });
	
	// Path 2: Right
	setCell(board5, 6, 5, { player: 'p1' });
	setCell(board5, 7, 5, { player: 'p1' });
	setCell(board5, 8, 5, { player: 'p1' });
	
	// Path 3: Up
	setCell(board5, 5, 4, { player: 'p1' });
	setCell(board5, 5, 3, { player: 'p1' });
	setCell(board5, 5, 2, { player: 'p1' });
	
	// Path 4: Down
	setCell(board5, 5, 6, { player: 'p1' });
	setCell(board5, 5, 7, { player: 'p1' });
	
	// Create a game object
	const game5 = {
		board: board5,
		chessPieces: [
			{ player: 'p1', type: 'king', x: 5, z: 5 }
		]
	};
	
	// Visualize the board
	islandManager.logBoard(board5);
	
	// Check paths to the king from different directions
	const leftPath = islandManager.hasPathToKing(game5, 1, 5, 'p1');
	const rightPath = islandManager.hasPathToKing(game5, 8, 5, 'p1');
	const upPath = islandManager.hasPathToKing(game5, 5, 2, 'p1');
	const downPath = islandManager.hasPathToKing(game5, 5, 7, 'p1');
	
	console.log(`Path from left (1,5) to king: ${leftPath}`);
	console.log(`Path from right (8,5) to king: ${rightPath}`);
	console.log(`Path from up (5,2) to king: ${upPath}`);
	console.log(`Path from down (5,7) to king: ${downPath}`);
	
	// Assertions
	assert.strictEqual(leftPath, true, 'Should have a path from the left');
	assert.strictEqual(rightPath, true, 'Should have a path from the right');
	assert.strictEqual(upPath, true, 'Should have a path from above');
	assert.strictEqual(downPath, true, 'Should have a path from below');

	console.log('All island connectivity tests passed!');
}

// Run all tests
try {
	testIslandConnectivity();
	console.log('✅ All tests passed successfully!');
} catch (error) {
	console.error('❌ Test failed:', error.message);
	console.error('Stack trace:', error.stack);
	process.exit(1);
} 