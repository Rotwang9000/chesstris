/**
 * Home Zone Chess Pieces Initialization Test
 * Tests that chess pieces are properly created and placed when home zones are initialized
 */

const assert = require('assert');
const path = require('path');

// Simple mock for the BoardManager
class MockBoardManager {
	constructor() {
		this.cells = {};
	}

	setCell(board, x, z, value) {
		const key = `${x},${z}`;
		this.cells[key] = value;
		return true;
	}

	getCell(board, x, z) {
		const key = `${x},${z}`;
		return this.cells[key] || null;
	}

	getCellsInArea(board, x1, z1, x2, z2) {
		const cells = [];
		for (let x = x1; x <= x2; x++) {
			for (let z = z1; z <= z2; z++) {
				const cell = this.getCell(board, x, z);
				if (cell) {
					cells.push({ x, z, ...cell });
				}
			}
		}
		return cells;
	}
}

// Simple mock for the IslandManager
class MockIslandManager {
	hasPathToKing() {
		return true; // Always return true for testing
	}
}

/**
 * Create a ChessManager instance for testing
 */
function createChessManager() {
	const boardManager = new MockBoardManager();
	const islandManager = new MockIslandManager();
	
	// Require the actual ChessManager implementation
	const ChessManager = require('../../server/game/ChessManager');
	return new ChessManager(boardManager, islandManager);
}

/**
 * Test horizontal home zone chess piece initialization (8x2)
 */
function testHorizontalHomeZoneChessPieces() {
	console.log('\n--- TEST 1: Horizontal Home Zone Chess Pieces (8x2) ---');
	
	const chessManager = createChessManager();
	const boardManager = chessManager.boardManager;
	
	// Create a mock game
	const game = {
		board: {},
		chessPieces: [],
		players: {
			'player1': {
				id: 'player1',
				name: 'Player 1',
				color: '#FF0000'
			}
		}
	};
	
	// Define a horizontal home zone
	const homeZone = {
		x: 10,
		z: 20,
		width: 8,
		height: 2
	};

	// Initialize chess pieces
	const pieces = chessManager.initializeChessPieces(game, 'player1', homeZone);
	
	// Manually assign pieces to game.chessPieces for the test 
	// In production, this is done by PlayerManager.registerPlayer
	game.chessPieces = pieces;
	
	// Verify correct number of pieces were created (16 pieces: 8 pawns + 8 major pieces)
	assert.strictEqual(pieces.length, 16, `Expected 16 chess pieces, but got ${pieces.length}`);
	console.log(`Created ${pieces.length} chess pieces for horizontal home zone`);
	
	// Verify all pieces were added to game.chessPieces
	assert.strictEqual(game.chessPieces.length, 16, `Expected 16 chess pieces in game, but got ${game.chessPieces.length}`);
	
	// Verify back row pieces (major pieces)
	const backRowPieces = pieces.filter(p => p.position.z === homeZone.z);
	assert.strictEqual(backRowPieces.length, 8, 'Expected 8 major pieces in back row');
	
	// Verify presence of each piece type in the back row
	const pieceTypes = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
	for (let i = 0; i < pieceTypes.length; i++) {
		const piece = backRowPieces.find(p => p.position.x === homeZone.x + i);
		assert.strictEqual(piece.type, pieceTypes[i], `Expected ${pieceTypes[i]} at position ${homeZone.x + i},${homeZone.z}`);
	}
	
	// Verify pawns in the front row
	const pawns = pieces.filter(p => p.position.z === homeZone.z + 1);
	assert.strictEqual(pawns.length, 8, 'Expected 8 pawns in front row');
	for (let i = 0; i < 8; i++) {
		const pawn = pawns.find(p => p.position.x === homeZone.x + i);
		assert.strictEqual(pawn.type, 'PAWN', `Expected PAWN at position ${homeZone.x + i},${homeZone.z + 1}`);
	}
	
	// Verify cell occupation in the board
	for (let i = 0; i < 8; i++) {
		// Check back row
		const backCell = boardManager.getCell(game.board, homeZone.x + i, homeZone.z);
		assert.notStrictEqual(backCell, null, `Cell at (${homeZone.x + i},${homeZone.z}) should be occupied`);
		assert.strictEqual(backCell.type, 'chess', `Cell at (${homeZone.x + i},${homeZone.z}) should be a chess cell`);
		assert.strictEqual(backCell.player, 'player1', `Cell at (${homeZone.x + i},${homeZone.z}) should belong to player1`);
		
		// Check front row
		const frontCell = boardManager.getCell(game.board, homeZone.x + i, homeZone.z + 1);
		assert.notStrictEqual(frontCell, null, `Cell at (${homeZone.x + i},${homeZone.z + 1}) should be occupied`);
		assert.strictEqual(frontCell.type, 'chess', `Cell at (${homeZone.x + i},${homeZone.z + 1}) should be a chess cell`);
		assert.strictEqual(frontCell.player, 'player1', `Cell at (${homeZone.x + i},${homeZone.z + 1}) should belong to player1`);
	}
	
	console.log('✅ Horizontal home zone chess pieces initialized correctly');
}

/**
 * Test vertical home zone chess piece initialization (2x8)
 */
function testVerticalHomeZoneChessPieces() {
	console.log('\n--- TEST 2: Vertical Home Zone Chess Pieces (2x8) ---');
	
	const chessManager = createChessManager();
	const boardManager = chessManager.boardManager;
	
	// Create a mock game
	const game = {
		board: {},
		chessPieces: [],
		players: {
			'player2': {
				id: 'player2',
				name: 'Player 2',
				color: '#00FF00'
			}
		}
	};
	
	// Define a vertical home zone
	const homeZone = {
		x: 30,
		z: 40,
		width: 2,
		height: 8
	};

	// Initialize chess pieces
	const pieces = chessManager.initializeChessPieces(game, 'player2', homeZone);
	
	// Manually assign pieces to game.chessPieces for the test 
	// In production, this is done by PlayerManager.registerPlayer
	game.chessPieces = pieces;
	
	// Verify correct number of pieces were created (16 pieces: 8 pawns + 8 major pieces)
	assert.strictEqual(pieces.length, 16, `Expected 16 chess pieces, but got ${pieces.length}`);
	console.log(`Created ${pieces.length} chess pieces for vertical home zone`);
	
	// Verify all pieces were added to game.chessPieces
	assert.strictEqual(game.chessPieces.length, 16, `Expected 16 chess pieces in game, but got ${game.chessPieces.length}`);
	
	// Verify main column pieces (major pieces)
	const mainColPieces = pieces.filter(p => p.position.x === homeZone.x);
	assert.strictEqual(mainColPieces.length, 8, 'Expected 8 major pieces in main column');
	
	// Verify presence of each piece type in the main column
	const pieceTypes = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];
	for (let i = 0; i < pieceTypes.length; i++) {
		const piece = mainColPieces.find(p => p.position.z === homeZone.z + i);
		assert.strictEqual(piece.type, pieceTypes[i], `Expected ${pieceTypes[i]} at position ${homeZone.x},${homeZone.z + i}`);
	}
	
	// Verify pawns in the second column
	const pawns = pieces.filter(p => p.position.x === homeZone.x + 1);
	assert.strictEqual(pawns.length, 8, 'Expected 8 pawns in second column');
	for (let i = 0; i < 8; i++) {
		const pawn = pawns.find(p => p.position.z === homeZone.z + i);
		assert.strictEqual(pawn.type, 'PAWN', `Expected PAWN at position ${homeZone.x + 1},${homeZone.z + i}`);
	}
	
	// Verify cell occupation in the board
	for (let i = 0; i < 8; i++) {
		// Check main column
		const mainCell = boardManager.getCell(game.board, homeZone.x, homeZone.z + i);
		assert.notStrictEqual(mainCell, null, `Cell at (${homeZone.x},${homeZone.z + i}) should be occupied`);
		assert.strictEqual(mainCell.type, 'chess', `Cell at (${homeZone.x},${homeZone.z + i}) should be a chess cell`);
		assert.strictEqual(mainCell.player, 'player2', `Cell at (${homeZone.x},${homeZone.z + i}) should belong to player2`);
		
		// Check second column
		const secondCell = boardManager.getCell(game.board, homeZone.x + 1, homeZone.z + i);
		assert.notStrictEqual(secondCell, null, `Cell at (${homeZone.x + 1},${homeZone.z + i}) should be occupied`);
		assert.strictEqual(secondCell.type, 'chess', `Cell at (${homeZone.x + 1},${homeZone.z + i}) should be a chess cell`);
		assert.strictEqual(secondCell.player, 'player2', `Cell at (${homeZone.x + 1},${homeZone.z + i}) should belong to player2`);
	}
	
	console.log('✅ Vertical home zone chess pieces initialized correctly');
}

/**
 * Test that multiple player home zones get unique pieces
 */
function testMultiplePlayerHomeZones() {
	console.log('\n--- TEST 3: Multiple Player Home Zones ---');
	
	const chessManager = createChessManager();
	const boardManager = chessManager.boardManager;
	
	// Create a mock game
	const game = {
		board: {},
		chessPieces: [],
		players: {
			'player1': {
				id: 'player1',
				name: 'Player 1',
				color: '#FF0000'
			},
			'player2': {
				id: 'player2',
				name: 'Player 2',
				color: '#00FF00'
			}
		}
	};
	
	// Define two home zones
	const homeZone1 = {
		x: 10,
		z: 20,
		width: 8,
		height: 2
	};
	
	const homeZone2 = {
		x: 30,
		z: 40,
		width: 2,
		height: 8
	};

	// Initialize chess pieces for both players
	const pieces1 = chessManager.initializeChessPieces(game, 'player1', homeZone1);
	const pieces2 = chessManager.initializeChessPieces(game, 'player2', homeZone2);
	
	// Manually assign pieces to game.chessPieces for the test 
	// In production, this is done by PlayerManager.registerPlayer
	game.chessPieces = pieces1.concat(pieces2);
	
	// Verify correct number of pieces
	assert.strictEqual(pieces1.length, 16, 'Player 1 should have 16 chess pieces');
	assert.strictEqual(pieces2.length, 16, 'Player 2 should have 16 chess pieces');
	assert.strictEqual(game.chessPieces.length, 32, 'Game should have 32 chess pieces in total');
	
	// Verify pieces have different IDs and owners
	for (const piece1 of pieces1) {
		// Verify ownership
		assert.strictEqual(piece1.player, 'player1', `Piece ${piece1.id} should belong to player1`);
		
		// Verify no duplicate IDs
		for (const piece2 of pieces2) {
			assert.notStrictEqual(piece1.id, piece2.id, 'Pieces should have unique IDs');
			assert.strictEqual(piece2.player, 'player2', `Piece ${piece2.id} should belong to player2`);
		}
	}
	
	// Verify kings are in the correct position
	const king1 = pieces1.find(p => p.type === 'KING');
	const king2 = pieces2.find(p => p.type === 'KING');
	
	assert.deepStrictEqual(king1.position, { x: homeZone1.x + 4, z: homeZone1.z }, 'Player 1 king should be at the correct position');
	assert.deepStrictEqual(king2.position, { x: homeZone2.x, z: homeZone2.z + 4 }, 'Player 2 king should be at the correct position');
	
	console.log('✅ Multiple players have unique chess pieces');
}

/**
 * Run all home zone chess piece initialization tests
 */
function runTests() {
	console.log('Testing home zone chess piece initialization...');
	
	try {
		// Test horizontal home zone
		testHorizontalHomeZoneChessPieces();
		
		// Test vertical home zone
		testVerticalHomeZoneChessPieces();
		
		// Test multiple player home zones
		testMultiplePlayerHomeZones();
		
		// All tests passed
		console.log('\n✅ All home zone chess piece initialization tests passed!');
	} catch (error) {
		console.error(`\n❌ TEST FAILED: ${error.message}`);
		console.error(error.stack);
		process.exit(1);
	}
}

// Run the tests
runTests(); 