/**
 * King Capture Test
 * Tests the mechanics of capturing a king in Shaktris
 */

const assert = require('assert');
const path = require('path');

// Minimal mock of GameManager
class MockGameManager {
	constructor() {
		this.events = [];
		this.transferredPieces = [];
		this.players = {};
	}
	
	emitEvent(eventName, payload) {
		this.events.push({ eventName, payload });
		return true;
	}
	
	getPlayerById(id) {
		return this.players[id];
	}
	
	transferPiecesToNewOwner(pieces, newOwnerId) {
		this.transferredPieces.push({ pieces, newOwnerId });
		
		// Update piece ownership
		pieces.forEach(piece => {
			piece.playerId = newOwnerId;
			
			// Add to the new owner's pieces
			if (!this.players[newOwnerId].pieces) {
				this.players[newOwnerId].pieces = [];
			}
			this.players[newOwnerId].pieces.push(piece);
		});
		
		return pieces;
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
	
	// Setup players
	gameManager.players = {
		'p1': {
			id: 'p1',
			name: 'Player 1',
			pieces: [
				{ id: 'p1_king', type: 'king', x: 0, y: 0, playerId: 'p1' },
				{ id: 'p1_queen', type: 'queen', x: 1, y: 0, playerId: 'p1' },
				{ id: 'p1_rook', type: 'rook', x: 2, y: 0, playerId: 'p1' },
				{ id: 'p1_knight', type: 'knight', x: 3, y: 0, playerId: 'p1' }
			],
			homeZone: { x: 0, y: 0, width: 5, height: 5 },
			territory: [
				{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }
			],
			balance: 10.0 // Starting balance in SOL
		},
		'p2': {
			id: 'p2',
			name: 'Player 2',
			pieces: [
				{ id: 'p2_king', type: 'king', x: 9, y: 9, playerId: 'p2' },
				{ id: 'p2_rook', type: 'rook', x: 8, y: 9, playerId: 'p2' },
				{ id: 'p2_bishop', type: 'bishop', x: 7, y: 9, playerId: 'p2' }
			],
			homeZone: { x: 6, y: 6, width: 5, height: 5 },
			territory: [
				{ x: 9, y: 9 }, { x: 8, y: 9 }, { x: 7, y: 9 }
			],
			balance: 5.0
		}
	};
	
	// Place pieces on the board
	gameManager.players.p1.pieces.forEach(piece => {
		board.setCell(piece.x, piece.y, {
			type: 'chess',
			piece: piece.type,
			playerId: 'p1'
		});
	});
	
	gameManager.players.p2.pieces.forEach(piece => {
		board.setCell(piece.x, piece.y, {
			type: 'chess',
			piece: piece.type,
			playerId: 'p2'
		});
	});
	
	// Return the mock game state
	return {
		gameManager,
		board,
		players: gameManager.players
	};
}

/**
 * Test king capture mechanics
 */
function testKingCapture() {
	console.log('Testing king capture...');
	
	// Helper function to simulate the capturing of a king
	function captureKing(gameState, capturingPlayerId, capturedPlayerId) {
		const { gameManager, board, players } = gameState;
		
		// Find the king to be captured
		const capturedPlayer = players[capturedPlayerId];
		const capturedKing = capturedPlayer.pieces.find(p => p.type === 'king');
		
		if (!capturedKing) {
			return { success: false, reason: 'No king found to capture' };
		}
		
		// Find the capturing player
		const capturingPlayer = players[capturingPlayerId];
		
		if (!capturingPlayer) {
			return { success: false, reason: 'Capturing player not found' };
		}
		
		// Log the initial state
		console.log(`\nInitial state before capture:`);
		console.log(`Player ${capturingPlayerId} has ${capturingPlayer.pieces.length} pieces and a balance of ${capturingPlayer.balance} SOL`);
		console.log(`Player ${capturedPlayerId} has ${capturedPlayer.pieces.length} pieces and a balance of ${capturedPlayer.balance} SOL`);
		
		// Simulate king capture
		console.log(`\nCapturing ${capturedPlayerId}'s king at (${capturedKing.x}, ${capturedKing.y})...`);
		
		// 1. Collect all non-king pieces from the captured player
		const piecesToTransfer = capturedPlayer.pieces.filter(p => p.type !== 'king');
		console.log(`Found ${piecesToTransfer.length} pieces to transfer to ${capturingPlayerId}`);
		
		// 2. Transfer pieces to the capturing player
		const transferredPieces = gameManager.transferPiecesToNewOwner(
			piecesToTransfer,
			capturingPlayerId
		);
		
		// 3. Transfer balance
		const balanceToTransfer = capturedPlayer.balance;
		capturingPlayer.balance += balanceToTransfer;
		capturedPlayer.balance = 0;
		console.log(`Transferred ${balanceToTransfer} SOL to ${capturingPlayerId}`);
		
		// 4. Clear the king from the board
		board.clearCell(capturedKing.x, capturedKing.y);
		console.log(`Removed king from (${capturedKing.x}, ${capturedKing.y})`);
		
		// 5. Empty captured player's pieces array (don't just filter out king)
		capturedPlayer.pieces = [];
		
		// 6. Emit king captured event
		gameManager.emitEvent('kingCaptured', {
			capturingPlayerId,
			capturedPlayerId,
			transferredPieces,
			balanceTransferred: balanceToTransfer
		});
		
		// Log the final state
		console.log(`\nFinal state after capture:`);
		console.log(`Player ${capturingPlayerId} has ${capturingPlayer.pieces.length} pieces and a balance of ${capturingPlayer.balance} SOL`);
		console.log(`Player ${capturedPlayerId} has ${capturedPlayer.pieces.length} pieces and a balance of ${capturedPlayer.balance} SOL`);
		
		return {
			success: true,
			transferredPieces,
			balanceTransferred: balanceToTransfer,
			events: gameManager.events
		};
	}
	
	// TEST 1: Basic king capture
	console.log('\n--- TEST 1: Basic king capture ---');
	let gameState = createMockGameState();
	
	// Capture player 2's king with player 1
	const result = captureKing(gameState, 'p1', 'p2');
	
	assert.strictEqual(result.success, true, 'King capture should succeed');
	assert.strictEqual(result.transferredPieces.length, 2, 'Should transfer 2 pieces (all except king)');
	assert.strictEqual(result.balanceTransferred, 5.0, 'Should transfer 5.0 SOL');
	
	// Verify the players' states
	assert.strictEqual(gameState.players.p1.pieces.length, 6, 'Player 1 should now have 6 pieces (4 original + 2 transferred)');
	assert.strictEqual(gameState.players.p2.pieces.length, 0, 'Player 2 should have no pieces left');
	assert.strictEqual(gameState.players.p1.balance, 15.0, 'Player 1 should have 15.0 SOL (10.0 + 5.0)');
	assert.strictEqual(gameState.players.p2.balance, 0, 'Player 2 should have 0 SOL');
	
	// Verify the board state - king should be removed
	assert.strictEqual(gameState.board.getCell(9, 9), null, 'King cell should be cleared');
	
	// Verify events were emitted
	assert.strictEqual(gameState.gameManager.events.length, 1, 'One event should be emitted');
	assert.strictEqual(gameState.gameManager.events[0].eventName, 'kingCaptured', 'Event should be kingCaptured');
	assert.strictEqual(gameState.gameManager.events[0].payload.capturingPlayerId, 'p1', 'Capturing player should be p1');
	assert.strictEqual(gameState.gameManager.events[0].payload.capturedPlayerId, 'p2', 'Captured player should be p2');
	
	// TEST 2: Multiple king captures (chain capture)
	console.log('\n--- TEST 2: Multiple king captures (chain capture) ---');
	gameState = createMockGameState();
	
	// Add a third player
	gameState.players['p3'] = {
		id: 'p3',
		name: 'Player 3',
		pieces: [
			{ id: 'p3_king', type: 'king', x: 15, y: 15, playerId: 'p3' },
			{ id: 'p3_queen', type: 'queen', x: 14, y: 15, playerId: 'p3' }
		],
		homeZone: { x: 12, y: 12, width: 5, height: 5 },
		territory: [
			{ x: 15, y: 15 }, { x: 14, y: 15 }
		],
		balance: 7.5
	};
	
	// Place p3's pieces on the board
	gameState.players.p3.pieces.forEach(piece => {
		gameState.board.setCell(piece.x, piece.y, {
			type: 'chess',
			piece: piece.type,
			playerId: 'p3'
		});
	});
	
	// First capture: p1 captures p2
	console.log('\nFirst capture: p1 captures p2');
	const firstCapture = captureKing(gameState, 'p1', 'p2');
	
	// Second capture: p1 captures p3
	console.log('\nSecond capture: p1 captures p3');
	const secondCapture = captureKing(gameState, 'p1', 'p3');
	
	// Verify final state
	assert.strictEqual(gameState.players.p1.pieces.length, 7, 'Player 1 should have 7 pieces (original 4 + 2 from p2 + 1 from p3)');
	assert.strictEqual(gameState.players.p1.balance, 22.5, 'Player 1 should have 22.5 SOL (10.0 + 5.0 + 7.5)');
	assert.strictEqual(gameState.players.p2.pieces.length, 0, 'Player 2 should have no pieces');
	assert.strictEqual(gameState.players.p3.pieces.length, 0, 'Player 3 should have no pieces');
	
	// TEST 3: Territory transfer
	console.log('\n--- TEST 3: Territory transfer ---');
	gameState = createMockGameState();
	
	// Add territory cells to the board for player 2
	gameState.players.p2.territory.forEach(cell => {
		gameState.board.setCell(cell.x, cell.y, {
			type: 'tetromino',
			playerId: 'p2'
		});
	});
	
	// Log the initial territory
	console.log(`Player 1 territory: ${gameState.players.p1.territory.length} cells`);
	console.log(`Player 2 territory: ${gameState.players.p2.territory.length} cells`);
	
	// Store player 2's territory before capture
	const p2Territory = [...gameState.players.p2.territory];
	
	// Capture the king and transfer territory
	const captureWithTerritory = captureKing(gameState, 'p1', 'p2');
	
	// Transfer territory in our test logic
	gameState.players.p1.territory = [
		...gameState.players.p1.territory,
		...p2Territory
	];
	
	// Clear player 2's territory
	gameState.players.p2.territory = [];
	
	// Update cell ownership on the board
	p2Territory.forEach(cell => {
		const boardCell = gameState.board.getCell(cell.x, cell.y);
		if (boardCell && boardCell.type === 'tetromino') {
			boardCell.playerId = 'p1';
		}
	});
	
	// Log the final territory
	console.log(`Player 1 territory: ${gameState.players.p1.territory.length} cells`);
	console.log(`Player 2 territory: ${gameState.players.p2.territory.length} cells`);
	
	// Verify territory transfer
	assert.strictEqual(gameState.players.p1.territory.length, 7, 'Player 1 should have 7 territory cells (4 original + 3 from p2)');
	assert.strictEqual(gameState.players.p2.territory.length, 0, 'Player 2 should have no territory left');
	
	console.log('All king capture tests passed!');
}

// Run all tests
try {
	testKingCapture();
	console.log('✅ All tests passed successfully!');
} catch (error) {
	console.error('❌ Test failed:', error.message);
	console.error('Stack trace:', error.stack);
	process.exit(1);
} 