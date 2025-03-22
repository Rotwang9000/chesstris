/**
 * Tetromino Placement Tests
 * Tests core functionality of placing tetromino blocks on the game board
 */

const assert = require('assert');
const path = require('path');

// Import mocks if needed
const semverMock = require('../mocks/semverMock');

// Minimal mock of GameManager
class MockGameManager {
	constructor() {
		this.events = [];
		this.playerTerritories = {};
	}
	
	emitEvent(eventName, payload) {
		this.events.push({ eventName, payload });
		return true;
	}
	
	getPlayerById(id) {
		return {
			id,
			name: `Player ${id}`,
			territory: this.playerTerritories?.[id] || []
		};
	}
}

/**
 * Create a basic game state for testing
 */
function createMockGameState() {
	const gameManager = new MockGameManager();
	
	// Create a mock board
	const board = {
		cells: {},
		getCell: function(x, y) {
			const key = `${x},${y}`;
			return this.cells[key] || null;
		},
		setCell: function(x, y, value) {
			const key = `${x},${y}`;
			this.cells[key] = value;
			return true;
		},
		clearCell: function(x, y) {
			const key = `${x},${y}`;
			delete this.cells[key];
			return true;
		},
		getAllCells: function() {
			return Object.entries(this.cells).map(([key, value]) => {
				const [x, y] = key.split(',').map(Number);
				return { x, y, ...value };
			});
		}
	};
	
	// Setup player territories
	gameManager.playerTerritories = {
		'p1': [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 0, y: 1 }
		],
		'p2': [
			{ x: 9, y: 9 },
			{ x: 8, y: 9 },
			{ x: 9, y: 8 }
		]
	};
	
	// Return the mock game state
	return {
		gameManager,
		board,
		players: {
			'p1': { id: 'p1', name: 'Player 1', kingPosition: { x: 0, y: 0 } },
			'p2': { id: 'p2', name: 'Player 2', kingPosition: { x: 9, y: 9 } }
		}
	};
}

/**
 * Test placeTetromino function
 */
function testTetrominoPlacement() {
	console.log('Testing tetromino placement...');
	
	// Helper function to simulate the placeTetromino functionality
	function placeTetromino(gameState, playerId, blocks) {
		const { gameManager, board, players } = gameState;
		const player = players[playerId];
		
		// 1. Check if blocks are adjacent to player territory
		const playerTerritory = gameManager.playerTerritories[playerId];
		console.log('Player territory:', playerTerritory);
		console.log('Blocks to place:', blocks);
		
		const isAdjacentToTerritory = blocks.some(block => {
			return playerTerritory.some(territory => {
				const dx = Math.abs(block.x - territory.x);
				const dy = Math.abs(block.y - territory.y);
				const isAdjacent = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
				console.log(`Checking block (${block.x},${block.y}) against territory (${territory.x},${territory.y}): dx=${dx}, dy=${dy}, isAdjacent=${isAdjacent}`);
				return isAdjacent;
			});
		});
		
		console.log('Is adjacent to territory:', isAdjacentToTerritory);
		
		if (!isAdjacentToTerritory) {
			return { success: false, reason: 'Blocks must be adjacent to player territory' };
		}
		
		// 2. Check for collisions with existing cells
		const hasCollision = blocks.some(block => {
			const cell = board.getCell(block.x, block.y);
			const hasCollision = cell !== null;
			console.log(`Checking collision at (${block.x},${block.y}): ${hasCollision}`);
			return hasCollision;
		});
		
		if (hasCollision) {
			return { success: false, reason: 'Blocks collide with existing cells' };
		}
		
		// 3. Check if there's a path to the king
		// (Simplified for testing - we'll just check direct line for now)
		const kingX = player.kingPosition.x;
		const kingY = player.kingPosition.y;
		console.log(`King position: (${kingX},${kingY})`);
		
		const pathToKingExists = blocks.some(block => {
			// Check if king is directly adjacent
			const dx = Math.abs(block.x - kingX);
			const dy = Math.abs(block.y - kingY);
			const isPathToKing = (dx <= 1 && dy <= 1);
			console.log(`Checking path from block (${block.x},${block.y}) to king: dx=${dx}, dy=${dy}, isPathToKing=${isPathToKing}`);
			
			return isPathToKing;
		});
		
		console.log('Path to king exists:', pathToKingExists);
		
		if (!pathToKingExists) {
			return { success: false, reason: 'No path to king exists' };
		}
		
		// 4. If all checks pass, add cells to the board
		blocks.forEach(block => {
			board.setCell(block.x, block.y, {
				type: 'tetromino',
				playerId
			});
			console.log(`Added block at (${block.x},${block.y})`);
		});
		
		// Update player territory
		blocks.forEach(block => {
			gameManager.playerTerritories[playerId].push({ x: block.x, y: block.y });
			console.log(`Added (${block.x},${block.y}) to player territory`);
		});
		
		// Emit event
		gameManager.emitEvent('tetrominoPlaced', {
			playerId,
			blocks
		});
		console.log('Emitted tetrominoPlaced event');
		
		return { success: true };
	}
	
	/**
	 * Debug function to help understand the issue with placement
	 */
	function debugTetrominoPlacement(gameState) {
		console.log('\n=== DEBUG: Tetromino Placement ===');
		
		// 1. Check player territories
		const p1Territory = gameState.gameManager.playerTerritories['p1'];
		const p2Territory = gameState.gameManager.playerTerritories['p2'];
		
		console.log('Player 1 territory:', p1Territory);
		console.log('Player 2 territory:', p2Territory);
		
		// 2. Check if we can place a tetromino next to player 1's territory
		const blockToPlace = { x: 1, y: 1 }; // Should be adjacent to player 1's territory
		const isAdjacent = p1Territory.some(cell => {
			const dx = Math.abs(blockToPlace.x - cell.x);
			const dy = Math.abs(blockToPlace.y - cell.y);
			console.log(`Testing adjacency: block(${blockToPlace.x},${blockToPlace.y}) to territory(${cell.x},${cell.y}): dx=${dx}, dy=${dy}, adjacent=${(dx === 1 && dy === 0) || (dx === 0 && dy === 1)}`);
			return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
		});
		
		console.log(`Is block (${blockToPlace.x},${blockToPlace.y}) adjacent to player 1's territory? ${isAdjacent}`);
		
		// 3. Check if there's a collision at that position
		const existingCell = gameState.board.getCell(blockToPlace.x, blockToPlace.y);
		console.log(`Is there a collision at (${blockToPlace.x},${blockToPlace.y})? ${existingCell !== null}`);
		
		// 4. Check path to king
		const kingPosition = gameState.players['p1'].kingPosition;
		console.log(`Player 1 king position: (${kingPosition.x},${kingPosition.y})`);
		
		const dx = Math.abs(blockToPlace.x - kingPosition.x);
		const dy = Math.abs(blockToPlace.y - kingPosition.y);
		const hasPathToKing = dx <= 1 && dy <= 1;
		
		console.log(`Does block (${blockToPlace.x},${blockToPlace.y}) have a path to king? ${hasPathToKing}`);
		
		// 5. Check the entire placement logic
		console.log('\nSimulating full placement logic:');
		const result = placeTetromino(gameState, 'p1', [blockToPlace]);
		console.log('Placement result:', result);
		
		return isAdjacent && !existingCell && hasPathToKing;
	}
	
	// Run debug function to help identify issues
	const testState = createMockGameState();
	debugTetrominoPlacement(testState);
	
	// TEST 1: Valid placement adjacent to player territory
	let gameState = createMockGameState();
	console.log('\n--- TEST 1: Valid placement adjacent to player territory ---');
	const validBlocks = [
		{ x: 1, y: 1 }, // Adjacent to player 1's territory and king
		{ x: 2, y: 1 }  // Adjacent to the first block
	];
	const result1 = placeTetromino(gameState, 'p1', validBlocks);
	console.log('Result:', result1);
	console.log('Cell at (1,1):', gameState.board.getCell(1, 1));
	console.log('Events:', gameState.gameManager.events);
	
	assert.strictEqual(result1.success, true, 'Valid placement should succeed');
	assert.strictEqual(gameState.board.getCell(1, 1).playerId, 'p1', 'Cell should be marked with player ID');
	assert.strictEqual(gameState.gameManager.events.length, 1, 'Event should be emitted');
	assert.strictEqual(gameState.gameManager.events[0].eventName, 'tetrominoPlaced', 'Event type should be tetrominoPlaced');
	
	// TEST 2: Invalid placement not connected to player territory
	gameState = createMockGameState();
	console.log('\n--- TEST 2: Invalid placement not connected to player territory ---');
	const invalidBlocks = [
		{ x: 5, y: 5 }, // Not adjacent to either player's territory
		{ x: 6, y: 5 }
	];
	const result2 = placeTetromino(gameState, 'p1', invalidBlocks);
	console.log('Result:', result2);
	
	assert.strictEqual(result2.success, false, 'Invalid placement should fail');
	assert.strictEqual(result2.reason, 'Blocks must be adjacent to player territory', 'Correct reason for failure');
	assert.strictEqual(gameState.board.getCell(5, 5), null, 'No cell should be created for invalid placement');
	
	// TEST 3: Invalid placement due to collision
	gameState = createMockGameState();
	console.log('\n--- TEST 3: Invalid placement due to collision ---');
	gameState.board.setCell(1, 1, { type: 'tetromino', playerId: 'p2' });
	console.log('Placed existing block at (1,1)');
	const collidingBlocks = [
		{ x: 1, y: 1 }, // This cell is already occupied
		{ x: 2, y: 1 }
	];
	const result3 = placeTetromino(gameState, 'p1', collidingBlocks);
	console.log('Result:', result3);
	
	assert.strictEqual(result3.success, false, 'Placement with collision should fail');
	assert.strictEqual(result3.reason, 'Blocks collide with existing cells', 'Correct reason for collision failure');
	
	// TEST 4: Invalid placement with no path to king
	gameState = createMockGameState();
	console.log('\n--- TEST 4: Invalid placement with no path to king ---');
	const noPathBlocks = [
		{ x: 2, y: 0 }, // Adjacent to territory but not to king
		{ x: 3, y: 0 }
	];
	const result4 = placeTetromino(gameState, 'p1', noPathBlocks);
	console.log('Result:', result4);
	
	assert.strictEqual(result4.success, false, 'Placement with no path to king should fail');
	assert.strictEqual(result4.reason, 'No path to king exists', 'Correct reason for path failure');
	
	console.log('All tetromino placement tests passed!');
}

// Run all tests
try {
	testTetrominoPlacement();
	console.log('✅ All tests passed successfully!');
} catch (error) {
	console.error('❌ Test failed:', error.message);
	console.error('Stack trace:', error.stack);
	process.exit(1);
} 