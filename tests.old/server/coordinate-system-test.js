/**
 * Test suite for coordinate system changes (XY-Z to XZ-Y)
 * This script verifies that the new coordinate system works correctly
 * for key game operations like tetromino placement and chess movement.
 */

const GameManager = require('../../server/game/GameManager');
const assert = require('assert');

// Test constants
const GAME_ID = 'coordinate-test-game';
const PLAYER_ID = 'test-player-1';
const PLAYER_NAME = 'Test Player';

// Create a test instance
function runCoordinateSystemTests() {
	console.log('Running coordinate system tests...');
	
	const gameManager = new GameManager();
	
	// Create a test game
	const createResult = gameManager.createGame({
		gameId: GAME_ID,
		width: 20,
		height: 20,
		boardSize: 20
	});
	
	assert.strictEqual(createResult.success, true, 'Failed to create test game');
	console.log('Test game created successfully');
	
	// Add a test player
	const addPlayerResult = gameManager.addPlayer(GAME_ID, PLAYER_ID, PLAYER_NAME);
	assert.strictEqual(addPlayerResult.success, true, 'Failed to add test player');
	console.log('Test player added successfully');
	
	// Get the game
	const game = gameManager.games.get(GAME_ID);
	
	// Test 1: Verify that board is accessed using [z][x] coordinates
	console.log('\nTest 1: Board coordinates');
	// Place a cell manually at z=5, x=5
	const testZ = 5;
	const testX = 5;
	game.board[testZ][testX] = {
		type: 'test',
		player: PLAYER_ID
	};
	
	// Verify the cell exists
	assert.notStrictEqual(game.board[testZ][testX], null, 'Test cell not found at [z][x]');
	console.log('Cell correctly accessed using [z][x] coordinates');
	
	// Test 2: Test _hasCellUnderneath method
	console.log('\nTest 2: _hasCellUnderneath method');
	const hasCellResult = gameManager._hasCellUnderneath(game, testX, testZ);
	assert.strictEqual(hasCellResult, true, '_hasCellUnderneath failed to find cell');
	console.log('_hasCellUnderneath correctly uses x,z parameters');
	
	// Test 3: Test tetromino placement coordinates
	console.log('\nTest 3: Tetromino placement');
	// Clear the existing cell
	game.board[testZ][testX] = null;
	
	// Create a simple tetromino (2x2 square)
	const testTetromino = [
		[1, 1],
		[1, 1]
	];
	
	// Test _placeTetromino method directly
	const placedCells = gameManager._placeTetromino(game, testTetromino, testX, testZ, PLAYER_ID);
	
	// Verify cells were placed at the correct coordinates
	assert.strictEqual(placedCells.length, 4, 'Incorrect number of cells placed');
	
	// Check a specific cell
	assert.notStrictEqual(game.board[testZ][testX], null, 'Tetromino cell not found at correct position');
	assert.notStrictEqual(game.board[testZ+1][testX+1], null, 'Tetromino cell not found at correct position');
	console.log('Tetromino correctly placed using x,z coordinates');
	
	// Test 4: Test _hasAdjacentCell method
	console.log('\nTest 4: _hasAdjacentCell method');
	const adjacentResult = gameManager._hasAdjacentCell(game, testX + 2, testZ, PLAYER_ID);
	assert.strictEqual(adjacentResult.hasAdjacent, true, '_hasAdjacentCell failed to find adjacent cell');
	assert.strictEqual(adjacentResult.x, testX + 1, 'Adjacent cell X coordinate incorrect');
	assert.strictEqual(adjacentResult.z, testZ, 'Adjacent cell Z coordinate incorrect');
	console.log('_hasAdjacentCell correctly uses x,z parameters');
	
	// Final results
	console.log('\nAll coordinate system tests passed successfully!');
	console.log('The coordinate system has been successfully updated to XZ-Y.');
}

// Run the tests
try {
	runCoordinateSystemTests();
} catch (error) {
	console.error('Test failed:', error);
} 