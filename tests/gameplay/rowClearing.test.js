/**
 * Row Clearing Tests
 * Tests the mechanics of row clearing when 8 cells are aligned
 */

const assert = require('assert');
const path = require('path');

// Minimal mock of GameManager
class MockGameManager {
	constructor() {
		this.events = [];
	}
	
	emitEvent(eventName, payload) {
		this.events.push({ eventName, payload });
		return true;
	}
	
	getPlayerById(id) {
		return {
			id,
			name: `Player ${id}`,
			color: id === 'p1' ? 'white' : 'black'
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
		},
		getRowCells: function(y) {
			return Object.entries(this.cells)
				.filter(([key]) => {
					const [, cellY] = key.split(',').map(Number);
					return cellY === y;
				})
				.map(([key, value]) => {
					const [x, y] = key.split(',').map(Number);
					return { x, y, ...value };
				});
		},
		getColumnCells: function(x) {
			return Object.entries(this.cells)
				.filter(([key]) => {
					const [cellX] = key.split(',').map(Number);
					return cellX === x;
				})
				.map(([key, value]) => {
					const [x, y] = key.split(',').map(Number);
					return { x, y, ...value };
				});
		}
	};
	
	// Setup initial pieces
	const pieces = {
		'p1': [
			{ id: 'p1_king', type: 'king', x: 0, y: 0, playerId: 'p1' },
			{ id: 'p1_rook', type: 'rook', x: 1, y: 1, playerId: 'p1' }
		],
		'p2': [
			{ id: 'p2_king', type: 'king', x: 7, y: 7, playerId: 'p2' },
			{ id: 'p2_queen', type: 'queen', x: 6, y: 7, playerId: 'p2' }
		]
	};
	
	// Place pieces on board
	for (const playerId in pieces) {
		pieces[playerId].forEach(piece => {
			board.setCell(piece.x, piece.y, {
				type: 'chess',
				piece: piece.type,
				playerId
			});
		});
	}
	
	// Setup home cells
	const homeCells = {
		'p1': { x: 0, y: 0 },  // Player 1's king location is home
		'p2': { x: 7, y: 7 }   // Player 2's king location is home
	};
	
	// Return the mock game state
	return {
		gameManager,
		board,
		pieces,
		homeCells,
		players: {
			'p1': { id: 'p1', name: 'Player 1', color: 'white' },
			'p2': { id: 'p2', name: 'Player 2', color: 'black' }
		}
	};
}

/**
 * Helper function to check for completed rows
 */
function checkForCompletedRows(gameState) {
	const completedRows = [];
	
	// Check each row for 8 consecutive filled cells
	for (let y = 0; y < 10; y++) {
		const rowCells = gameState.board.getRowCells(y);
		
		// Skip rows with fewer than 8 cells
		if (rowCells.length < 8) continue;
		
		// Count consecutive cells
		let maxConsecutive = 0;
		let currentConsecutive = 0;
		let lastX = -2;  // Start with a non-adjacent value
		
		// Sort cells by x coordinate
		rowCells.sort((a, b) => a.x - b.x);
		
		for (const cell of rowCells) {
			// Skip home cells
			const isHome = Object.values(gameState.homeCells).some(
				home => home.x === cell.x && home.y === cell.y
			);
			
			if (isHome) continue;
			
			// Check if this cell is adjacent to the previous one
			if (cell.x === lastX + 1) {
				currentConsecutive++;
			} else {
				currentConsecutive = 1;
			}
			
			lastX = cell.x;
			maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
		}
		
		if (maxConsecutive >= 8) {
			completedRows.push(y);
		}
	}
	
	// Similarly, check columns
	for (let x = 0; x < 10; x++) {
		const colCells = gameState.board.getColumnCells(x);
		
		// Skip columns with fewer than 8 cells
		if (colCells.length < 8) continue;
		
		// Count consecutive cells
		let maxConsecutive = 0;
		let currentConsecutive = 0;
		let lastY = -2;  // Start with a non-adjacent value
		
		// Sort cells by y coordinate
		colCells.sort((a, b) => a.y - b.y);
		
		for (const cell of colCells) {
			// Skip home cells
			const isHome = Object.values(gameState.homeCells).some(
				home => home.x === cell.x && home.y === cell.y
			);
			
			if (isHome) continue;
			
			// Check if this cell is adjacent to the previous one
			if (cell.y === lastY + 1) {
				currentConsecutive++;
			} else {
				currentConsecutive = 1;
			}
			
			lastY = cell.y;
			maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
		}
		
		if (maxConsecutive >= 8) {
			// Store as negative to indicate it's a column
			completedRows.push(-x - 1);  // Offset by -1 to avoid confusion with 0
		}
	}
	
	return completedRows;
}

/**
 * Helper function to clear a completed row
 */
function clearRow(gameState, rowIndicator) {
	const isColumn = rowIndicator < 0;
	const rowOrColIndex = isColumn ? -rowIndicator - 1 : rowIndicator;
	
	// Get cells to clear
	const cellsToClear = isColumn 
		? gameState.board.getColumnCells(rowOrColIndex)
		: gameState.board.getRowCells(rowOrColIndex);
	
	// Filter out home cells
	const filteredCells = cellsToClear.filter(cell => {
		return !Object.values(gameState.homeCells).some(
			home => home.x === cell.x && home.y === cell.y
		);
	});
	
	// Remove pieces affected by clearing
	const affectedPieces = [];
	
	for (const cell of filteredCells) {
		if (cell.type === 'chess') {
			// Find the piece
			for (const playerId in gameState.pieces) {
				const pieceIndex = gameState.pieces[playerId].findIndex(
					p => p.x === cell.x && p.y === cell.y
				);
				
				if (pieceIndex >= 0) {
					const piece = gameState.pieces[playerId][pieceIndex];
					affectedPieces.push(piece);
					
					// Remove piece for now - may be restored to home later
					gameState.pieces[playerId].splice(pieceIndex, 1);
				}
			}
		}
		
		// Clear the cell
		gameState.board.clearCell(cell.x, cell.y);
	}
	
	// Try to place affected pieces back in home cells
	const restoredPieces = [];
	
	for (const piece of affectedPieces) {
		// Check if home cell is available
		const homeCellX = gameState.homeCells[piece.playerId].x;
		const homeCellY = gameState.homeCells[piece.playerId].y;
		
		if (!gameState.board.getCell(homeCellX, homeCellY)) {
			// Home cell is available - return the piece home
			gameState.board.setCell(homeCellX, homeCellY, {
				type: 'chess',
				piece: piece.type,
				playerId: piece.playerId
			});
			
			// Update piece position
			piece.x = homeCellX;
			piece.y = homeCellY;
			
			// Add back to player's pieces
			gameState.pieces[piece.playerId].push(piece);
			
			restoredPieces.push(piece);
		}
		// If home cell is not available, piece remains captured
	}
	
	// Emit event
	gameState.gameManager.emitEvent('rowCleared', {
		rowIndicator,
		clearedCells: filteredCells,
		affectedPieces,
		restoredPieces
	});
	
	return {
		clearedCells: filteredCells,
		affectedPieces,
		restoredPieces
	};
}

/**
 * Test row clearing functionality
 */
function testRowClearing() {
	console.log('Testing row clearing...');
	
	// TEST 1: Detect horizontal row with 8 consecutive cells
	let gameState = createMockGameState();
	console.log('\n--- TEST 1: Detect horizontal row ---');
	
	// Add 8 tetromino cells in a row (row 3)
	console.log('Adding 8 cells in row 3:');
	for (let x = 0; x < 8; x++) {
		gameState.board.setCell(x, 3, {
			type: 'tetromino',
			playerId: 'p1'
		});
		console.log(`  Added cell at (${x},3)`);
	}
	
	const completedRows = checkForCompletedRows(gameState);
	console.log('Completed rows detected:', completedRows);
	
	assert.strictEqual(completedRows.length, 1, 'Should detect one completed row');
	assert.strictEqual(completedRows[0], 3, 'Should detect row 3 as completed');
	
	// TEST 2: Clear the completed row
	console.log('\nClearing row 3:');
	const clearResult = clearRow(gameState, completedRows[0]);
	console.log('Cells cleared:', clearResult.clearedCells.length);
	console.log('Remaining cells in row 3:', gameState.board.getRowCells(3).length);
	console.log('Events:', gameState.gameManager.events);
	
	assert.strictEqual(clearResult.clearedCells.length, 8, 'Should clear 8 cells');
	assert.strictEqual(gameState.board.getRowCells(3).length, 0, 'Row should be empty after clearing');
	assert.strictEqual(gameState.gameManager.events.length, 1, 'Should emit a row cleared event');
	
	// TEST 3: Home cells should not be counted for row completion
	gameState = createMockGameState();
	console.log('\n--- TEST 3: Home cells handling ---');
	
	// Add cells in row 0 (where p1's king/home is)
	console.log('Adding cells in row 0 (with home cell):');
	for (let x = 1; x < 9; x++) {  // Skip x=0 which is home
		gameState.board.setCell(x, 0, {
			type: 'tetromino',
			playerId: 'p1'
		});
		console.log(`  Added cell at (${x},0)`);
	}
	
	const rowsWithHome = checkForCompletedRows(gameState);
	console.log('Completed rows with home:', rowsWithHome);
	
	assert.strictEqual(rowsWithHome.length, 1, 'Should detect row 0 as completed despite home cell');
	
	// TEST 4: Clearing row with pieces should handle the pieces correctly
	gameState = createMockGameState();
	console.log('\n--- TEST 4: Clearing row with pieces ---');
	
	// Move the king to a different position to free up home cell
	console.log('Moving king away from home:');
	const king = gameState.pieces.p1.find(p => p.id === 'p1_king');
	king.x = 2;
	king.y = 0;
	gameState.board.clearCell(0, 0);
	gameState.board.setCell(2, 0, {
		type: 'chess',
		piece: 'king',
		playerId: 'p1'
	});
	console.log(`  Moved king to (${king.x},${king.y})`);
	
	// Update home cell for rook - it will now be (1,1)
	gameState.homeCells.p1 = { x: 1, y: 1 };
	console.log(`  Set rook home cell to (1,1)`);
	
	// Move p1's rook to row 3
	console.log('Setting up rook in row 3:');
	const rook = gameState.pieces.p1.find(p => p.id === 'p1_rook');
	rook.x = 2;
	rook.y = 3;
	gameState.board.clearCell(1, 1);
	gameState.board.setCell(2, 3, {
		type: 'chess',
		piece: 'rook',
		playerId: 'p1'
	});
	console.log(`  Moved rook to (${rook.x},${rook.y})`);
	
	// Add 7 tetromino cells to complete row 3
	console.log('Adding cells to complete row 3:');
	for (let x = 0; x < 8; x++) {
		if (x !== 2) {  // Skip the rook position
			gameState.board.setCell(x, 3, {
				type: 'tetromino',
				playerId: 'p1'
			});
			console.log(`  Added cell at (${x},3)`);
		}
	}
	
	const rowWithPiece = checkForCompletedRows(gameState);
	console.log('Completed rows with piece:', rowWithPiece);
	
	assert.strictEqual(rowWithPiece.length, 1, 'Should detect row 3 as completed');
	
	// Clear the row and check the piece handling
	console.log('\nClearing row with piece:');
	const clearWithPieceResult = clearRow(gameState, rowWithPiece[0]);
	console.log('Affected pieces:', clearWithPieceResult.affectedPieces);
	console.log('Restored pieces:', clearWithPieceResult.restoredPieces);
	console.log('Player 1 pieces after clearing:', gameState.pieces.p1);
	console.log('Cell at home (1,1):', gameState.board.getCell(1, 1));
	
	assert.strictEqual(clearWithPieceResult.affectedPieces.length, 1, 'One piece should be affected');
	assert.strictEqual(clearWithPieceResult.affectedPieces[0].id, 'p1_rook', 'The rook should be affected');
	assert.strictEqual(clearWithPieceResult.restoredPieces.length, 1, 'The rook should be restored to home');
	assert.strictEqual(gameState.pieces.p1.length, 2, 'Player 1 should still have 2 pieces');
	
	// Check if the rook was restored to home
	const restoredRook = gameState.pieces.p1.find(p => p.id === 'p1_rook');
	console.log('Restored rook:', restoredRook);
	
	assert.strictEqual(restoredRook.x, 1, 'Rook should be at home x');
	assert.strictEqual(restoredRook.y, 1, 'Rook should be at home y');
	
	// TEST 5: When home cell is occupied, piece can't be restored
	gameState = createMockGameState();
	console.log('\n--- TEST 5: Home cell occupied ---');
	
	// Put both of p2's pieces in row 5
	console.log('Moving p2 pieces to row 5:');
	gameState.pieces.p2.forEach(piece => {
		const oldX = piece.x;
		const oldY = piece.y;
		piece.y = 5;
		gameState.board.clearCell(oldX, oldY);
		gameState.board.setCell(piece.x, 5, {
			type: 'chess',
			piece: piece.type,
			playerId: 'p2'
		});
		console.log(`  Moved ${piece.id} from (${oldX},${oldY}) to (${piece.x},5)`);
	});
	
	// Put a tetromino at p2's home
	console.log('Adding tetromino at p2 home (7,7):');
	gameState.board.setCell(7, 7, {
		type: 'tetromino',
		playerId: 'p1'
	});
	
	// Add cells to complete row 5
	console.log('Adding cells to complete row 5:');
	for (let x = 0; x < 8; x++) {
		if (x !== 6 && x !== 7) {  // Skip the positions of p2's pieces
			gameState.board.setCell(x, 5, {
				type: 'tetromino',
				playerId: 'p1'
			});
			console.log(`  Added cell at (${x},5)`);
		}
	}
	
	const rowWithPieces = checkForCompletedRows(gameState);
	console.log('Completed rows with multiple pieces:', rowWithPieces);
	
	assert.strictEqual(rowWithPieces.length, 1, 'Should detect row 5 as completed');
	
	// Clear the row and check that pieces can't be restored
	console.log('\nClearing row with occupied home:');
	const clearWithOccupiedHome = clearRow(gameState, rowWithPieces[0]);
	console.log('Affected pieces:', clearWithOccupiedHome.affectedPieces);
	console.log('Restored pieces:', clearWithOccupiedHome.restoredPieces);
	console.log('Player 2 pieces after clearing:', gameState.pieces.p2);
	console.log('Cell at p2 home (7,7):', gameState.board.getCell(7, 7));
	
	assert.strictEqual(clearWithOccupiedHome.affectedPieces.length, 2, 'Two pieces should be affected');
	assert.strictEqual(clearWithOccupiedHome.restoredPieces.length, 0, 'No pieces should be restored as home is occupied');
	assert.strictEqual(gameState.pieces.p2.length, 0, 'Player 2 should have 0 pieces left');
	
	console.log('All row clearing tests passed!');
}

// Run the tests
try {
	testRowClearing();
	console.log('✅ All tests passed successfully!');
} catch (error) {
	console.error('❌ Test failed:', error.message);
	process.exit(1);
} 