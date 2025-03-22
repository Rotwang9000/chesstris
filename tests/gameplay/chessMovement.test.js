/**
 * Chess Movement Tests
 * Tests core mechanics of chess piece movement
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
		}
	};
	
	// Setup initial pieces
	const pieces = {
		'p1': [
			{ id: 'p1_king', type: 'king', x: 0, y: 0, playerId: 'p1' },
			{ id: 'p1_rook', type: 'rook', x: 1, y: 0, playerId: 'p1' },
			{ id: 'p1_knight', type: 'knight', x: 2, y: 0, playerId: 'p1' },
			{ id: 'p1_bishop', type: 'bishop', x: 3, y: 0, playerId: 'p1' },
			{ id: 'p1_queen', type: 'queen', x: 4, y: 0, playerId: 'p1' },
			{ id: 'p1_pawn1', type: 'pawn', x: 0, y: 1, playerId: 'p1' },
			{ id: 'p1_pawn2', type: 'pawn', x: 1, y: 1, playerId: 'p1' }
		],
		'p2': [
			{ id: 'p2_king', type: 'king', x: 7, y: 7, playerId: 'p2' },
			{ id: 'p2_rook', type: 'rook', x: 7, y: 6, playerId: 'p2' },
			{ id: 'p2_knight', type: 'knight', x: 6, y: 7, playerId: 'p2' },
			{ id: 'p2_bishop', type: 'bishop', x: 5, y: 7, playerId: 'p2' },
			{ id: 'p2_queen', type: 'queen', x: 4, y: 7, playerId: 'p2' },
			{ id: 'p2_pawn1', type: 'pawn', x: 6, y: 6, playerId: 'p2' },
			{ id: 'p2_pawn2', type: 'pawn', x: 7, y: 5, playerId: 'p2' }
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
	
	// Return the mock game state
	return {
		gameManager,
		board,
		pieces,
		players: {
			'p1': { id: 'p1', name: 'Player 1', color: 'white' },
			'p2': { id: 'p2', name: 'Player 2', color: 'black' }
		}
	};
}

/**
 * Helper function to check if a move is valid
 */
function isValidMove(gameState, pieceId, targetX, targetY) {
	// Find the piece
	let piece = null;
	let playerId = null;
	
	for (const pId in gameState.pieces) {
		const found = gameState.pieces[pId].find(p => p.id === pieceId);
		if (found) {
			piece = found;
			playerId = pId;
			break;
		}
	}
	
	if (!piece) {
		console.log(`Piece with ID ${pieceId} not found`);
		return { valid: false, reason: 'Piece not found' };
	}
	
	console.log(`Found piece: ${piece.type} at (${piece.x},${piece.y}) for player ${playerId}`);
	
	// Check if target is on the board
	if (targetX < 0 || targetX > 9 || targetY < 0 || targetY > 9) {
		console.log(`Target (${targetX},${targetY}) is off the board`);
		return { valid: false, reason: 'Target is off the board' };
	}
	
	// Check if target is occupied by own piece
	const targetCell = gameState.board.getCell(targetX, targetY);
	if (targetCell && targetCell.playerId === playerId) {
		console.log(`Target (${targetX},${targetY}) is occupied by own piece: ${targetCell.piece}`);
		return { valid: false, reason: 'Cannot capture own piece' };
	}
	
	// Movement rules based on piece type
	switch (piece.type) {
		case 'king':
			const dx = Math.abs(targetX - piece.x);
			const dy = Math.abs(targetY - piece.y);
			console.log(`King move: dx=${dx}, dy=${dy}`);
			if (dx > 1 || dy > 1) {
				return { valid: false, reason: 'Invalid king move' };
			}
			break;
			
		case 'rook':
			if (targetX !== piece.x && targetY !== piece.y) {
				console.log(`Invalid rook move: not horizontal or vertical`);
				return { valid: false, reason: 'Rook can only move horizontally or vertically' };
			}
			
			// Check for pieces in the way
			if (targetX === piece.x) {
				// Vertical movement
				const dir = targetY > piece.y ? 1 : -1;
				for (let y = piece.y + dir; y !== targetY; y += dir) {
					if (gameState.board.getCell(piece.x, y)) {
						console.log(`Rook path blocked at (${piece.x},${y})`);
						return { valid: false, reason: 'Path is blocked' };
					}
				}
			} else {
				// Horizontal movement
				const dir = targetX > piece.x ? 1 : -1;
				for (let x = piece.x + dir; x !== targetX; x += dir) {
					if (gameState.board.getCell(x, piece.y)) {
						console.log(`Rook path blocked at (${x},${piece.y})`);
						return { valid: false, reason: 'Path is blocked' };
					}
				}
			}
			break;
			
		case 'knight':
			const knightDx = Math.abs(targetX - piece.x);
			const knightDy = Math.abs(targetY - piece.y);
			console.log(`Knight move: dx=${knightDx}, dy=${knightDy}`);
			if (!((knightDx === 1 && knightDy === 2) || (knightDx === 2 && knightDy === 1))) {
				return { valid: false, reason: 'Invalid knight move' };
			}
			break;
			
		case 'bishop':
			const bishopDx = Math.abs(targetX - piece.x);
			const bishopDy = Math.abs(targetY - piece.y);
			console.log(`Bishop move: dx=${bishopDx}, dy=${bishopDy}`);
			if (bishopDx !== bishopDy) {
				return { valid: false, reason: 'Bishop can only move diagonally' };
			}
			
			// Check for pieces in the way
			const xDir = targetX > piece.x ? 1 : -1;
			const yDir = targetY > piece.y ? 1 : -1;
			for (let i = 1; i < bishopDx; i++) {
				if (gameState.board.getCell(piece.x + i * xDir, piece.y + i * yDir)) {
					console.log(`Bishop path blocked at (${piece.x + i * xDir},${piece.y + i * yDir})`);
					return { valid: false, reason: 'Path is blocked' };
				}
			}
			break;
			
		case 'queen':
			const queenDx = Math.abs(targetX - piece.x);
			const queenDy = Math.abs(targetY - piece.y);
			console.log(`Queen move: dx=${queenDx}, dy=${queenDy}`);
			
			const isDiagonal = queenDx === queenDy;
			const isStraight = targetX === piece.x || targetY === piece.y;
			
			if (!isDiagonal && !isStraight) {
				return { valid: false, reason: 'Queen can only move diagonally, horizontally, or vertically' };
			}
			
			// Check for pieces in the way
			if (isDiagonal) {
				// Diagonal movement
				const xDir = targetX > piece.x ? 1 : -1;
				const yDir = targetY > piece.y ? 1 : -1;
				for (let i = 1; i < queenDx; i++) {
					if (gameState.board.getCell(piece.x + i * xDir, piece.y + i * yDir)) {
						console.log(`Queen path blocked at (${piece.x + i * xDir},${piece.y + i * yDir})`);
						return { valid: false, reason: 'Path is blocked' };
					}
				}
			} else if (targetX === piece.x) {
				// Vertical movement
				const dir = targetY > piece.y ? 1 : -1;
				for (let y = piece.y + dir; y !== targetY; y += dir) {
					if (gameState.board.getCell(piece.x, y)) {
						console.log(`Queen path blocked at (${piece.x},${y})`);
						return { valid: false, reason: 'Path is blocked' };
					}
				}
			} else {
				// Horizontal movement
				const dir = targetX > piece.x ? 1 : -1;
				for (let x = piece.x + dir; x !== targetX; x += dir) {
					if (gameState.board.getCell(x, piece.y)) {
						console.log(`Queen path blocked at (${x},${piece.y})`);
						return { valid: false, reason: 'Path is blocked' };
					}
				}
			}
			break;
			
		case 'pawn':
			// Direction depends on player
			const moveDir = playerId === 'p1' ? 1 : -1;
			console.log(`Pawn move: from (${piece.x},${piece.y}) to (${targetX},${targetY}), moveDir=${moveDir}`);
			
			// Check if moving forward
			if (targetX === piece.x && targetY === piece.y + moveDir) {
				// Simple move forward - must be empty
				if (targetCell) {
					console.log(`Pawn's forward path blocked at (${targetX},${targetY})`);
					return { valid: false, reason: 'Pawn cannot move forward into occupied space' };
				}
			} else if (Math.abs(targetX - piece.x) === 1 && targetY === piece.y + moveDir) {
				// Capture move - must capture an opponent's piece
				if (!targetCell || targetCell.playerId === playerId) {
					console.log(`Invalid pawn capture at (${targetX},${targetY}): no opponent piece to capture`);
					return { valid: false, reason: 'Pawn can only move diagonally when capturing' };
				}
			} else {
				console.log(`Invalid pawn move from (${piece.x},${piece.y}) to (${targetX},${targetY})`);
				return { valid: false, reason: 'Invalid pawn move' };
			}
			break;
			
		default:
			console.log(`Unknown piece type: ${piece.type}`);
			return { valid: false, reason: 'Unknown piece type' };
	}
	
	console.log(`Move is valid: ${piece.type} from (${piece.x},${piece.y}) to (${targetX},${targetY})`);
	return { valid: true };
}

/**
 * Helper function to move a piece
 */
function movePiece(gameState, pieceId, targetX, targetY) {
	console.log(`\nAttempting to move piece ${pieceId} to (${targetX},${targetY})`);
	
	const moveCheck = isValidMove(gameState, pieceId, targetX, targetY);
	if (!moveCheck.valid) {
		console.log(`Move is invalid: ${moveCheck.reason}`);
		return moveCheck;
	}
	
	// Find the piece
	let piece = null;
	let playerId = null;
	
	for (const pId in gameState.pieces) {
		const found = gameState.pieces[pId].find(p => p.id === pieceId);
		if (found) {
			piece = found;
			playerId = pId;
			break;
		}
	}
	
	const targetCell = gameState.board.getCell(targetX, targetY);
	let capturedPiece = null;
	
	// If there's an opponent piece at the target, remove it
	if (targetCell && targetCell.playerId !== playerId) {
		console.log(`Capturing opponent piece at (${targetX},${targetY}): ${targetCell.piece}`);
		
		// Find the captured piece
		const opponentId = targetCell.playerId;
		const capturedIdx = gameState.pieces[opponentId].findIndex(
			p => p.x === targetX && p.y === targetY
		);
		
		if (capturedIdx >= 0) {
			capturedPiece = gameState.pieces[opponentId][capturedIdx];
			// Remove the captured piece
			gameState.pieces[opponentId].splice(capturedIdx, 1);
			console.log(`Removed captured piece: ${capturedPiece.id}`);
		}
	}
	
	// Update the board
	console.log(`Clearing cell at (${piece.x},${piece.y})`);
	gameState.board.clearCell(piece.x, piece.y);
	
	console.log(`Setting cell at (${targetX},${targetY}) to ${piece.type} for player ${playerId}`);
	gameState.board.setCell(targetX, targetY, {
		type: 'chess',
		piece: piece.type,
		playerId
	});
	
	// Check for pawn promotion
	let promotedTo = null;
	if (piece.type === 'pawn') {
		const promotionRank = playerId === 'p1' ? 7 : 0; // Last rank
		if (targetY === promotionRank) {
			// Promote to queen by default
			promotedTo = 'queen';
			piece.type = promotedTo;
			console.log(`Promoting pawn to queen at (${targetX},${targetY})`);
			
			// Update the cell to reflect the new piece type
			gameState.board.setCell(targetX, targetY, {
				type: 'chess',
				piece: promotedTo,
				playerId
			});
		}
	}
	
	// Update piece position
	console.log(`Updating piece position from (${piece.x},${piece.y}) to (${targetX},${targetY})`);
	piece.x = targetX;
	piece.y = targetY;
	
	// Emit the event
	gameState.gameManager.emitEvent('chessPieceMoved', {
		pieceId,
		playerId,
		from: { x: piece.x, y: piece.y },
		to: { x: targetX, y: targetY },
		captured: capturedPiece,
		promotedTo
	});
	console.log(`Emitted chessPieceMoved event`);
	
	return { 
		valid: true, 
		captured: capturedPiece, 
		promotedTo 
	};
}

/**
 * Run chess movement tests
 */
function testChessMovement() {
	console.log('Testing chess movement...');
	
	// TEST 1: Valid king move
	let gameState = createMockGameState();
	console.log('\n--- TEST 1: Valid king move ---');
	
	// Clear the cell at (0,1) to make sure the king can move there
	gameState.board.clearCell(0, 1);
	
	// Remove the pawn from player's pieces array
	const pawnIndex = gameState.pieces.p1.findIndex(p => p.id === 'p1_pawn1');
	if (pawnIndex !== -1) {
		gameState.pieces.p1.splice(pawnIndex, 1);
	}
	
	console.log('Cleared cell at (0,1) for king movement');
	
	// Now move the king to (0,1)
	const kingResult = movePiece(gameState, 'p1_king', 0, 1);
	console.log('King move result:', kingResult);
	
	const kingPosition = gameState.pieces.p1.find(p => p.id === 'p1_king');
	console.log('King position after move:', kingPosition);
	console.log('Cell at (0,1):', gameState.board.getCell(0, 1));
	
	assert.strictEqual(kingResult.valid, true, 'Valid king move should succeed');
	assert.strictEqual(kingPosition.x, 0, 'King x position should be updated');
	assert.strictEqual(kingPosition.y, 1, 'King y position should be updated');
	
	// TEST 2: Invalid king move (too far)
	gameState = createMockGameState();
	console.log('\n--- TEST 2: Invalid king move (too far) ---');
	const invalidKingResult = isValidMove(gameState, 'p1_king', 3, 3);
	console.log('Invalid king move result:', invalidKingResult);
	
	assert.strictEqual(invalidKingResult.valid, false, 'Invalid king move should fail');
	assert.strictEqual(invalidKingResult.reason, 'Invalid king move', 'Correct reason for failure');
	
	// TEST 3: Valid rook move
	gameState = createMockGameState();
	console.log('\n--- TEST 3: Valid rook move ---');
	
	// Clear the cells along the path to make sure the rook can move there
	gameState.board.clearCell(1, 1);
	
	// Remove the pawn from player's pieces array
	const pawnIndex2 = gameState.pieces.p1.findIndex(p => p.id === 'p1_pawn2');
	if (pawnIndex2 !== -1) {
		gameState.pieces.p1.splice(pawnIndex2, 1);
	}
	
	console.log('Cleared cell at (1,1) for rook movement');
	
	const rookResult = movePiece(gameState, 'p1_rook', 1, 5);
	console.log('Rook move result:', rookResult);
	
	const rookPosition = gameState.pieces.p1.find(p => p.id === 'p1_rook');
	console.log('Rook position after move:', rookPosition);
	console.log('Cell at (1,5):', gameState.board.getCell(1, 5));
	
	assert.strictEqual(rookResult.valid, true, 'Valid rook move should succeed');
	assert.strictEqual(rookPosition.y, 5, 'Rook position should be updated');
	
	// TEST 4: Invalid rook move (diagonal)
	gameState = createMockGameState();
	console.log('\n--- TEST 4: Invalid rook move (diagonal) ---');
	const invalidRookResult = isValidMove(gameState, 'p1_rook', 3, 2);
	console.log('Invalid rook move result:', invalidRookResult);
	
	assert.strictEqual(invalidRookResult.valid, false, 'Invalid rook move should fail');
	
	// TEST 5: Valid knight move
	gameState = createMockGameState();
	console.log('\n--- TEST 5: Valid knight move ---');
	const knightResult = movePiece(gameState, 'p1_knight', 4, 1);
	console.log('Knight move result:', knightResult);
	
	const knightPosition = gameState.pieces.p1.find(p => p.id === 'p1_knight');
	console.log('Knight position after move:', knightPosition);
	console.log('Cell at (4,1):', gameState.board.getCell(4, 1));
	
	assert.strictEqual(knightResult.valid, true, 'Valid knight move should succeed');
	assert.strictEqual(knightPosition.x, 4, 'Knight position should be updated');
	
	// TEST 6: Valid capturing move
	gameState = createMockGameState();
	console.log('\n--- TEST 6: Valid capturing move ---');
	
	// Instead of moving the rook, let's set it up directly at the capture position
	console.log('Setting up rook for capture test:');
	
	// First, remove the rook from its current position
	gameState.board.clearCell(1, 0);
	
	// Then place it at a position next to the piece to capture
	const rook = gameState.pieces.p1.find(p => p.id === 'p1_rook');
	rook.x = 7;
	rook.y = 5;  // Just below the target
	
	gameState.board.setCell(7, 5, {
		type: 'chess',
		piece: 'rook',
		playerId: 'p1'
	});
	
	console.log(`Rook positioned at (${rook.x},${rook.y})`);
	
	// Now capture the opponent piece directly above
	console.log('Now attempting to capture:');
	const captureResult = movePiece(gameState, 'p1_rook', 7, 6);
	console.log('Capture result:', captureResult);
	console.log('Remaining p2 pieces:', gameState.pieces.p2.length);
	
	assert.strictEqual(captureResult.valid, true, 'Valid capture should succeed');
	assert.strictEqual(captureResult.captured.id, 'p2_rook', 'Should capture the opponent rook');
	assert.strictEqual(gameState.pieces.p2.length, 6, 'Opponent should have one fewer piece');
	
	// TEST 7: Pawn promotion
	gameState = createMockGameState();
	console.log('\n--- TEST 7: Pawn promotion ---');
	// Move a pawn to the second-to-last rank
	console.log('Setting up pawn for promotion:');
	const pawn = gameState.pieces.p1.find(p => p.id === 'p1_pawn1');
	pawn.x = 0;
	pawn.y = 6;
	gameState.board.clearCell(0, 1);
	gameState.board.setCell(0, 6, { type: 'chess', piece: 'pawn', playerId: 'p1' });
	
	// Move to the last rank and promote
	const promotionResult = movePiece(gameState, 'p1_pawn1', 0, 7);
	console.log('Promotion result:', promotionResult);
	console.log('Promoted pawn:', gameState.pieces.p1.find(p => p.id === 'p1_pawn1'));
	
	assert.strictEqual(promotionResult.valid, true, 'Pawn promotion should succeed');
	assert.strictEqual(promotionResult.promotedTo, 'queen', 'Pawn should be promoted to queen');
	assert.strictEqual(gameState.pieces.p1.find(p => p.id === 'p1_pawn1').type, 'queen', 'Pawn type should be changed to queen');
	
	console.log('All chess movement tests passed!');
}

// Run the tests
try {
	testChessMovement();
	console.log('✅ All tests passed successfully!');
} catch (error) {
	console.error('❌ Test failed:', error.message);
	console.error('Stack trace:', error.stack);
	process.exit(1);
} 