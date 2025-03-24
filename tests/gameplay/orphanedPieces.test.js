/**
 * Tests for orphaned pieces handling
 * 
 * This test verifies that pieces disconnected from their king are properly
 * handled - they should be removed from the game board.
 */

// Utility function to create a mock game state
function createMockGame() {
	// Create a basic board
	const board = Array(20).fill().map(() => Array(20).fill(null));
	
	// Set up the game object
	const game = {
		board,
		players: {},
		chessPieces: [],
		islands: [],
		events: []
	};
	
	// Add an event emitter function
	game.emitEvent = function(eventName, payload) {
		this.events.push({ eventName, payload });
	};
	
	return game;
}

// Utility function to add a player with pieces
function addPlayerWithPieces(game, playerId) {
	// Add player
	game.players[playerId] = {
		id: playerId,
		name: `Player ${playerId}`
	};
	
	return game.players[playerId];
}

// Utility function to add a chess piece
function addChessPiece(game, pieceId, type, x, y, playerId) {
	const piece = { id: pieceId, type, x, y, playerId };
	game.chessPieces.push(piece);
	
	// Place the piece on the board
	if (y >= 0 && y < game.board.length && x >= 0 && x < game.board[y].length) {
		game.board[y][x] = { type: 'chess', piece: type, playerId };
	}
	
	return piece;
}

// Utility function to add territory cells for a player
function addTerritory(game, x, y, playerId) {
	if (y >= 0 && y < game.board.length && x >= 0 && x < game.board[y].length) {
		game.board[y][x] = { type: 'territory', playerId };
	}
}

// Check if there is a path from a piece to the king
function hasPathToKing(game, startX, startY, playerId) {
	// Find the king position
	let kingX = -1;
	let kingY = -1;
	
	for (const piece of game.chessPieces) {
		if (piece.playerId === playerId && piece.type === 'king') {
			kingX = piece.x;
			kingY = piece.y;
			break;
		}
	}
	
	if (kingX === -1 || kingY === -1) {
		return false; // King not found
	}
	
	// Use breadth-first search to find a path
	const queue = [{ x: startX, y: startY }];
	const visited = new Set();
	visited.add(`${startX},${startY}`);
	
	while (queue.length > 0) {
		const { x, y } = queue.shift();
		
		// Check if we've reached the king
		if (x === kingX && y === kingY) {
			return true;
		}
		
		// Check adjacent cells (4-directional)
		const directions = [
			{ dx: 0, dy: -1 }, // up
			{ dx: 1, dy: 0 },  // right
			{ dx: 0, dy: 1 },  // down
			{ dx: -1, dy: 0 }  // left
		];
		
		for (const { dx, dy } of directions) {
			const newX = x + dx;
			const newY = y + dy;
			
			// Skip if out of bounds
			if (newX < 0 || newX >= game.board[0].length || 
				newY < 0 || newY >= game.board.length) {
				continue;
			}
			
			// Skip if already visited
			const key = `${newX},${newY}`;
			if (visited.has(key)) {
				continue;
			}
			
			// Check if this cell belongs to the player
			const cell = game.board[newY][newX];
			if (cell && cell.playerId === playerId) {
				visited.add(key);
				queue.push({ x: newX, y: newY });
			}
		}
	}
	
	// No path found
	return false;
}

// Function to handle orphaned pieces
function handleOrphanedPieces(game) {
	const orphanedPieces = [];
	
	// Check each piece for connectivity to its king
	for (let i = game.chessPieces.length - 1; i >= 0; i--) {
		const piece = game.chessPieces[i];
		
		// Skip kings
		if (piece.type === 'king') continue;
		
		// Check if the piece has a path to its king
		if (!hasPathToKing(game, piece.x, piece.y, piece.playerId)) {
			orphanedPieces.push(piece);
			
			// Remove the piece from the board
			if (game.board[piece.y][piece.x] && 
				game.board[piece.y][piece.x].type === 'chess') {
				game.board[piece.y][piece.x] = null;
			}
			
			// Remove from chess pieces array
			game.chessPieces.splice(i, 1);
			
			// Emit an event
			game.emitEvent('pieceOrphaned', {
				playerId: piece.playerId,
				pieceId: piece.id,
				pieceType: piece.type,
				position: { x: piece.x, y: piece.y }
			});
		}
	}
	
	return orphanedPieces;
}

// Function to simulate row clearing
function clearRow(game, rowIndex) {
	// Find pieces in this row
	const piecesToRemove = [];
	
	// Check for pieces in the row
	for (let x = 0; x < game.board[0].length; x++) {
		const cell = game.board[rowIndex][x];
		if (cell && cell.type === 'chess') {
			// Find the piece in the chess pieces array
			const pieceIndex = game.chessPieces.findIndex(p => 
				p.x === x && p.y === rowIndex
			);
			
			if (pieceIndex !== -1) {
				piecesToRemove.push(game.chessPieces[pieceIndex]);
			}
		}
		
		// Clear the cell
		game.board[rowIndex][x] = null;
	}
	
	// Remove pieces from chess pieces array
	for (const piece of piecesToRemove) {
		const index = game.chessPieces.findIndex(p => 
			p.id === piece.id
		);
		
		if (index !== -1) {
			game.chessPieces.splice(index, 1);
		}
		
		// Emit an event
		game.emitEvent('pieceRemoved', {
			playerId: piece.playerId,
			pieceId: piece.id,
			pieceType: piece.type,
			position: { x: piece.x, y: piece.y }
		});
	}
	
	// Handle orphaned pieces after row clearing
	handleOrphanedPieces(game);
	
	// Emit an event
	game.emitEvent('rowCleared', {
		rowIndex,
		piecesRemoved: piecesToRemove
	});
	
	return piecesToRemove;
}

function testOrphanedPieces() {
	console.log('Testing orphaned pieces handling...');
	
	// --- TEST 1: Pieces disconnected by row clearing should be orphaned ---
	console.log('\n--- TEST 1: Pieces disconnected by row clearing should be orphaned ---');
	
	const game1 = createMockGame();
	addPlayerWithPieces(game1, 'p1');
	
	// Create a path from king to pieces
	//
	// K - King
	// R - Rook
	// N - Knight
	// p - player territory
	//
	// K p p p R
	// . . . . .
	// . . N . .
	
	// Add king and pieces
	const king = addChessPiece(game1, 'p1_king', 'king', 0, 0, 'p1');
	const rook = addChessPiece(game1, 'p1_rook', 'rook', 4, 0, 'p1');
	const knight = addChessPiece(game1, 'p1_knight', 'knight', 2, 2, 'p1');
	
	// Add player territory connecting them
	addTerritory(game1, 1, 0, 'p1');
	addTerritory(game1, 2, 0, 'p1');
	addTerritory(game1, 3, 0, 'p1');
	
	// Add territory connecting the knight
	addTerritory(game1, 2, 1, 'p1');
	
	// Print initial state
	console.log('Initial state:');
	console.log(`Player has king at (${king.x},${king.y}), rook at (${rook.x},${rook.y}), and knight at (${knight.x},${knight.y})`);
	console.log(`Path from rook to king: ${hasPathToKing(game1, rook.x, rook.y, 'p1')}`);
	console.log(`Path from knight to king: ${hasPathToKing(game1, knight.x, knight.y, 'p1')}`);
	
	// Clear the row with the king and rook
	console.log('\nClearing row 0 (contains king, rook, and connecting territory)...');
	const removedPieces = clearRow(game1, 0);
	
	// Check the results
	console.log(`Removed pieces: ${removedPieces.map(p => p.type).join(', ')}`);
	console.log(`Remaining chess pieces: ${game1.chessPieces.length}`);
	
	// Expect the knight to be orphaned and removed
	const knightOrphaned = !game1.chessPieces.some(p => p.id === 'p1_knight');
	console.log(`Knight orphaned and removed: ${knightOrphaned}`);
	
	// Check for orphaned piece event
	const orphanedEvents = game1.events.filter(e => e.eventName === 'pieceOrphaned');
	console.log(`Orphaned piece events: ${orphanedEvents.length}`);
	
	// Assertion
	if (!knightOrphaned) {
		throw new Error('Test 1 failed: Knight was not orphaned when disconnected from king');
	}
	
	// --- TEST 2: Pieces that maintain a path to king shouldn't be orphaned ---
	console.log('\n--- TEST 2: Pieces that maintain a path to king shouldn\'t be orphaned ---');
	
	const game2 = createMockGame();
	addPlayerWithPieces(game2, 'p1');
	
	// Create a setup with multiple paths to king
	//
	// K p p p R
	// p . . . .
	// p . N . .
	// p p p . .
	
	// Add king and pieces
	const king2 = addChessPiece(game2, 'p1_king', 'king', 0, 0, 'p1');
	const rook2 = addChessPiece(game2, 'p1_rook', 'rook', 4, 0, 'p1');
	const knight2 = addChessPiece(game2, 'p1_knight', 'knight', 2, 2, 'p1');
	
	// Add player territory - horizontal path
	addTerritory(game2, 1, 0, 'p1');
	addTerritory(game2, 2, 0, 'p1');
	addTerritory(game2, 3, 0, 'p1');
	
	// Add territory - vertical path
	addTerritory(game2, 0, 1, 'p1');
	addTerritory(game2, 0, 2, 'p1');
	addTerritory(game2, 0, 3, 'p1');
	
	// Add territory - bottom path to knight
	addTerritory(game2, 1, 3, 'p1');
	addTerritory(game2, 2, 3, 'p1');
	addTerritory(game2, 2, 1, 'p1');
	
	// Print initial state
	console.log('Initial state:');
	console.log(`Player has king at (${king2.x},${king2.y}), rook at (${rook2.x},${rook2.y}), and knight at (${knight2.x},${knight2.y})`);
	console.log(`Path from knight to king (top): ${hasPathToKing(game2, knight2.x, knight2.y, 'p1')}`);
	
	// Clear the top row (disconnecting the top path)
	console.log('\nClearing row 0 (contains king, rook, and top connecting path)...');
	const removedPieces2 = clearRow(game2, 0);
	
	// The king should be removed with the row
	console.log(`Removed pieces: ${removedPieces2.map(p => p.type).join(', ')}`);
	
	// Since the king is removed, all remaining pieces should be orphaned
	const knightOrphaned2 = !game2.chessPieces.some(p => p.id === 'p1_knight');
	console.log(`Knight orphaned and removed: ${knightOrphaned2}`);
	
	// Assertion
	if (!knightOrphaned2) {
		throw new Error('Test 2 failed: Knight was not orphaned when king was removed');
	}
	
	// --- TEST 3: Multiple disconnected pieces should all be orphaned ---
	console.log('\n--- TEST 3: Multiple disconnected pieces should all be orphaned ---');
	
	const game3 = createMockGame();
	addPlayerWithPieces(game3, 'p1');
	
	// Create a setup with multiple pieces that will be disconnected
	//
	// K p p p .
	// . . . p .
	// . . . p R
	// Q . . . .
	// . B . . .
	
	// Add king and pieces
	const king3 = addChessPiece(game3, 'p1_king', 'king', 0, 0, 'p1');
	const rook3 = addChessPiece(game3, 'p1_rook', 'rook', 4, 2, 'p1');
	const queen3 = addChessPiece(game3, 'p1_queen', 'queen', 0, 3, 'p1');
	const bishop3 = addChessPiece(game3, 'p1_bishop', 'bishop', 1, 4, 'p1');
	
	// Add player territory - horizontal path from king
	addTerritory(game3, 1, 0, 'p1');
	addTerritory(game3, 2, 0, 'p1');
	addTerritory(game3, 3, 0, 'p1');
	
	// Add territory - vertical path to rook
	addTerritory(game3, 3, 1, 'p1');
	addTerritory(game3, 3, 2, 'p1');
	
	// Connect queen to king
	addTerritory(game3, 0, 1, 'p1');
	addTerritory(game3, 0, 2, 'p1');
	
	// Connect bishop to queen
	addTerritory(game3, 1, 3, 'p1');
	
	// Print initial state
	console.log('Initial state:');
	console.log(`Player has king at (${king3.x},${king3.y}), rook at (${rook3.x},${rook3.y}), queen at (${queen3.x},${queen3.y}), and bishop at (${bishop3.x},${bishop3.y})`);
	
	// Clear the row with the connection between king and queen
	console.log('\nClearing row 2 (disconnecting queen and bishop from king)...');
	clearRow(game3, 2);
	
	// All pieces should be orphaned since we've disconnected all paths to the king
	const queenOrphaned = !game3.chessPieces.some(p => p.id === 'p1_queen');
	const bishopOrphaned = !game3.chessPieces.some(p => p.id === 'p1_bishop');
	const rookOrphaned = !game3.chessPieces.some(p => p.id === 'p1_rook');
	
	console.log(`Queen orphaned and removed: ${queenOrphaned}`);
	console.log(`Bishop orphaned and removed: ${bishopOrphaned}`);
	console.log(`Rook orphaned and removed: ${rookOrphaned}`);
	
	// Assertions
	if (!queenOrphaned) {
		throw new Error('Test 3 failed: Queen was not orphaned when disconnected from king');
	}
	
	if (!bishopOrphaned) {
		throw new Error('Test 3 failed: Bishop was not orphaned when disconnected from king');
	}
	
	if (!rookOrphaned) {
		throw new Error('Test 3 failed: Rook was not orphaned when disconnected from king');
	}
	
	console.log('\nAll orphaned pieces tests passed!');
	return true;
}

// Run the tests
try {
	const result = testOrphanedPieces();
	console.log(`✅ All tests passed successfully!`);
} catch (error) {
	console.error(`❌ Test failed:`, error.message);
} 